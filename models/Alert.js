/**
 * Alert Model
 * Stores disaster alerts and warnings
 */

const mongoose = require('mongoose');

const generateAlertCode = (type) => {
  const date = new Date();
  const normalizedType = typeof type === 'string' && type.length >= 3
    ? type.substring(0, 3).toUpperCase()
    : 'ALT';
  const timestamp = date.getTime().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();

  return `${normalizedType}-${timestamp}-${random}`;
};

const alertSchema = new mongoose.Schema({
  // Alert identification
  alertCode: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      return generateAlertCode(this.type);
    },
    index: true
  },
  
  // Alert type and title
  title: {
    type: String,
    required: [true, 'Please provide an alert title']
  },
  message: {
    type: String,
    required: [true, 'Please provide an alert message']
  },
  type: {
    type: String,
    required: true,
    enum: [
      'flood_warning',
      'cyclone_alert',
      'earthquake_warning',
      'tsunami_warning',
      'heatwave_warning',
      'storm_warning',
      'wildfire_warning',
      'landslide_warning',
      'evacuation_notice',
      'safety_advisory',
      'all_clear',
      'test'
    ]
  },
  disasterType: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    trim: true
  },
  liveSource: {
    type: Boolean,
    default: false
  },
  
  // Risk level
  severity: {
    type: String,
    required: true,
    enum: ['info', 'watch', 'warning', 'danger', 'emergency'],
    index: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'acknowledged', 'resolved', 'cancelled', 'expired'],
    default: 'active',
    index: true
  },
  
  // Target location
  targetLocation: {
    city: {
      type: String,
      required: true,
      index: true
    },
    state: {
      type: String,
      required: true
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    radius: {
      type: Number, // in kilometers
      default: 0
    },
    affectedAreas: [String] // List of specific areas/neighborhoods
  },
  
  // Related disaster
  disaster: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Disaster'
  },
  
  // Weather data that triggered this alert
  triggeringWeather: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WeatherData'
  },
  
  // Alert rules/thresholds that were exceeded
  triggeredRules: [{
    ruleName: String,
    parameter: String,
    threshold: Number,
    actualValue: Number,
    condition: String
  }],
  
  // Timeline
  timeline: {
    issuedAt: {
      type: Date,
      default: Date.now
    },
    effectiveFrom: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    acknowledgedAt: Date,
    resolvedAt: Date,
    cancelledAt: Date
  },
  
  // Issuer information
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sentToAll: {
    type: Boolean,
    default: false
  },
  sentToUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  issuingAuthority: {
    type: String,
    default: 'Disaster Management Authority'
  },
  
  // Acknowledgment (for authorities)
  acknowledgment: {
    acknowledgedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String,
    actions: [String]
  },
  
  // Delivery tracking
  delivery: {
    channels: [{
      type: String,
      enum: ['dashboard', 'email', 'sms', 'push', 'siren', 'radio', 'tv', 'social_media']
    }],
    sentTo: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      channel: String,
      sentAt: Date,
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      read: { type: Boolean, default: false },
      readAt: Date
    }],
    totalRecipients: Number,
    successfulDeliveries: { type: Number, default: 0 },
    failedDeliveries: { type: Number, default: 0 }
  },
  
  // Instructions for recipients
  instructions: {
    before: [String],
    during: [String],
    after: [String],
    evacuationRoutes: [{
      from: String,
      to: String,
      route: String
    }],
    shelterLocations: [{
      name: String,
      address: String,
      capacity: Number
    }],
    emergencyContacts: [{
      name: String,
      number: String,
      type: String
    }]
  },
  
  // Safety guidelines
  safetyGuidelines: [{
    category: String,
    content: String,
    priority: {
      type: Number,
      default: 1
    }
  }],
  
  // Related media
  media: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio', 'document']
    },
    url: String,
    caption: String
  }],
  
  // Cancellation reason (if cancelled)
  cancellationReason: {
    type: String,
    enum: ['false_alarm', 'situation_resolved', 'superseded', 'other']
  },
  cancellationNotes: String,
  
  // Statistics
  statistics: {
    views: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    responses: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes
alertSchema.index({ status: 1, severity: 1 });
alertSchema.index({ 'targetLocation.city': 1, status: 1 });
alertSchema.index({ 'timeline.issuedAt': -1 });
alertSchema.index({ type: 1 });
alertSchema.index({ disaster: 1 });
alertSchema.index({ sentToAll: 1, status: 1 });
alertSchema.index({ sentToUsers: 1, status: 1 });

// TTL index to auto-delete expired alerts after 90 days
alertSchema.index({ 'timeline.expiresAt': 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

// Ensure alertCode exists before required validation runs
alertSchema.pre('validate', function(next) {
  if (!this.alertCode) {
    this.alertCode = generateAlertCode(this.type);
  }
  next();
});

// Static method to get active alerts
alertSchema.statics.getActive = function() {
  const now = new Date();
  return this.find({
    status: 'active',
    'timeline.expiresAt': { $gt: now }
  }).sort({ 'timeline.issuedAt': -1 });
};

// Static method to get alerts by city
alertSchema.statics.getByCity = function(city) {
  const now = new Date();
  return this.find({
    'targetLocation.city': city,
    status: 'active',
    'timeline.expiresAt': { $gt: now }
  }).sort({ severity: -1, 'timeline.issuedAt': -1 });
};

// Static method to get critical alerts
alertSchema.statics.getCritical = function() {
  const now = new Date();
  return this.find({
    severity: { $in: ['danger', 'emergency'] },
    status: 'active',
    'timeline.expiresAt': { $gt: now }
  }).sort({ 'timeline.issuedAt': -1 });
};

// Method to acknowledge alert
alertSchema.methods.acknowledge = async function(userId, notes, actions) {
  this.status = 'acknowledged';
  this.timeline.acknowledgedAt = new Date();
  this.acknowledgment = {
    acknowledgedBy: userId,
    notes,
    actions
  };
  return await this.save();
};

// Method to resolve alert
alertSchema.methods.resolve = async function() {
  this.status = 'resolved';
  this.timeline.resolvedAt = new Date();
  return await this.save();
};

// Method to cancel alert
alertSchema.methods.cancel = async function(reason, notes) {
  this.status = 'cancelled';
  this.timeline.cancelledAt = new Date();
  this.cancellationReason = reason;
  this.cancellationNotes = notes;
  return await this.save();
};

// Method to track delivery
alertSchema.methods.trackDelivery = async function(userId, channel, delivered) {
  const existing = this.delivery.sentTo.find(
    s => s.user && s.user.toString() === userId
  );
  
  if (existing) {
    existing.delivered = delivered;
    if (delivered) {
      existing.deliveredAt = new Date();
      this.delivery.successfulDeliveries += 1;
    } else {
      this.delivery.failedDeliveries += 1;
    }
  } else {
    this.delivery.sentTo.push({
      user: userId,
      channel,
      sentAt: new Date(),
      delivered,
      deliveredAt: delivered ? new Date() : null
    });
    if (delivered) {
      this.delivery.successfulDeliveries += 1;
    } else {
      this.delivery.failedDeliveries += 1;
    }
  }
  
  return await this.save();
};

// Virtual for alert age
alertSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.timeline.issuedAt) / (1000 * 60)); // Minutes
});

// Virtual for time remaining
alertSchema.virtual('timeRemaining').get(function() {
  return Math.max(0, Math.floor((this.timeline.expiresAt - Date.now()) / (1000 * 60))); // Minutes
});

module.exports = mongoose.model('Alert', alertSchema);
