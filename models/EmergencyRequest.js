/**
 * Emergency Request Model
 * Tracks citizen emergency requests and their status
 */

const mongoose = require('mongoose');

const emergencyRequestSchema = new mongoose.Schema({
  // Request identification
  requestId: {
    type: String,
    unique: true,
    index: true
  },
  
  // Requester information
  citizen: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  citizenInfo: {
    name: String,
    phone: String,
    email: String,
    alternativeContact: String
  },
  
  // Request type
  type: {
    type: String,
    required: true,
    enum: [
      'medical_emergency',
      'rescue_request',
      'food_water',
      'shelter',
      'evacuation',
      'fire',
      'trapped',
      'injured',
      'missing_person',
      'animal_rescue',
      'supply_request',
      'information',
      'other'
    ]
  },
  
  // Priority level
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical', 'life_threatening'],
    default: 'medium'
  },
  
  // Status tracking
  status: {
    type: String,
    enum: [
      'pending',
      'acknowledged',
      'assigned',
      'in_progress',
      'en_route',
      'on_scene',
      'resolved',
      'cancelled',
      'escalated'
    ],
    default: 'pending',
    index: true
  },
  
  // Location
  location: {
    address: {
      type: String,
      required: true
    },
    landmark: String,
    city: {
      type: String,
      required: true,
      index: true
    },
    state: String,
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    accuracy: Number // GPS accuracy in meters
  },
  
  // Description
  description: {
    type: String,
    required: [true, 'Please provide a description of the emergency']
  },
  
  // Number of people affected
  peopleAffected: {
    type: Number,
    default: 1
  },
  
  // Special requirements
  specialRequirements: {
    medical: {
      hasInjuries: { type: Boolean, default: false },
      injuryDetails: String,
      needsAmbulance: { type: Boolean, default: false }
    },
    accessibility: {
      hasMobilityIssues: { type: Boolean, default: false },
      details: String
    },
    language: {
      preferred: { type: String, default: 'en' },
      needsTranslator: { type: Boolean, default: false }
    },
    other: String
  },
  
  // Related disaster (if applicable)
  disaster: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Disaster'
  },
  
  // Assignment
  assignment: {
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedTeam: String,
    assignedAt: Date,
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Timeline
  timeline: {
    reportedAt: {
      type: Date,
      default: Date.now
    },
    acknowledgedAt: Date,
    assignedAt: Date,
    startedAt: Date,
    enRouteAt: Date,
    onSceneAt: Date,
    resolvedAt: Date,
    cancelledAt: Date,
    lastUpdatedAt: {
      type: Date,
      default: Date.now
    }
  },
  
  // Updates/notes
  updates: [{
    status: String,
    note: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    location: {
      latitude: Number,
      longitude: Number
    }
  }],
  
  // Media attachments
  media: [{
    type: {
      type: String,
      enum: ['image', 'video', 'audio']
    },
    url: String,
    thumbnail: String,
    caption: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Resolution
  resolution: {
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    outcome: {
      type: String,
      enum: ['successful', 'partial', 'referred', 'false_alarm', 'unreachable', 'cancelled_by_user']
    },
    notes: String,
    followUpRequired: { type: Boolean, default: false },
    followUpNotes: String
  },
  
  // Feedback from citizen
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: String,
    submittedAt: Date
  },
  
  // Source
  source: {
    type: String,
    enum: ['web', 'mobile_app', 'phone', 'sms', 'social_media', 'walk_in', 'third_party'],
    default: 'web'
  },
  
  // Verification
  verification: {
    isVerified: { type: Boolean, default: false },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: Date,
    method: {
      type: String,
      enum: ['phone_call', 'video_call', 'third_party', 'on_scene', 'automatic']
    }
  }
}, {
  timestamps: true
});

// Indexes
emergencyRequestSchema.index({ status: 1, priority: 1 });
emergencyRequestSchema.index({ 'location.city': 1, status: 1 });
emergencyRequestSchema.index({ citizen: 1 });
emergencyRequestSchema.index({ 'assignment.assignedTo': 1 });
emergencyRequestSchema.index({ 'timeline.reportedAt': -1 });
emergencyRequestSchema.index({ disaster: 1 });

// Compound index for pending critical requests
emergencyRequestSchema.index({ 
  status: 1, 
  priority: 1,
  'timeline.reportedAt': 1 
});

// Pre-save middleware to generate request ID
emergencyRequestSchema.pre('save', async function(next) {
  if (!this.requestId) {
    const date = new Date();
    const prefix = 'EMR';
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.requestId = `${prefix}${year}${month}${day}-${random}`;
  }
  
  // Update lastUpdatedAt
  this.timeline.lastUpdatedAt = new Date();
  
  next();
});

// Static method to get pending requests
emergencyRequestSchema.statics.getPending = function() {
  return this.find({
    status: { $in: ['pending', 'acknowledged'] }
  }).sort({ priority: -1, 'timeline.reportedAt': 1 });
};

// Static method to get requests by citizen
emergencyRequestSchema.statics.getByCitizen = function(citizenId) {
  return this.find({ citizen: citizenId })
    .sort({ 'timeline.reportedAt': -1 });
};

// Static method to get assigned requests
emergencyRequestSchema.statics.getAssignedTo = function(userId) {
  return this.find({
    'assignment.assignedTo': userId,
    status: { $nin: ['resolved', 'cancelled'] }
  }).sort({ priority: -1, 'timeline.assignedAt': 1 });
};

// Static method to get statistics
emergencyRequestSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const priorityStats = await this.aggregate([
    {
      $match: { status: { $nin: ['resolved', 'cancelled'] } }
    },
    {
      $group: {
        _id: '$priority',
        count: { $sum: 1 }
      }
    }
  ]);
  
  return { statusStats: stats, priorityStats };
};

// Method to update status
emergencyRequestSchema.methods.updateStatus = async function(newStatus, note, userId) {
  const oldStatus = this.status;
  this.status = newStatus;
  
  // Map internal status names to timeline fields
  const statusToTimelineMap = {
    acknowledged: 'acknowledgedAt',
    assigned: 'assignedAt',
    in_progress: 'startedAt',
    en_route: 'enRouteAt',
    on_scene: 'onSceneAt',
    resolved: 'resolvedAt',
    cancelled: 'cancelledAt'
  };

  const timelineField = statusToTimelineMap[newStatus];
  if (timelineField && this.timeline[timelineField] !== undefined) {
    this.timeline[timelineField] = new Date();
  }
  this.timeline.lastUpdatedAt = new Date();
  
  // Add update
  this.updates.push({
    status: newStatus,
    note: note || `Status changed from ${formatLabel(oldStatus)} to ${formatLabel(newStatus)}`,
    updatedBy: userId,
    updatedAt: new Date()
  });
  
  return await this.save();
};

function formatLabel(value) {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Method to assign to responder
emergencyRequestSchema.methods.assign = async function(userId, assignedBy) {
  this.assignment.assignedTo = userId;
  this.assignment.assignedAt = new Date();
  this.assignment.assignedBy = assignedBy;
  this.status = 'assigned';
  this.timeline.assignedAt = new Date();
  this.timeline.lastUpdatedAt = new Date();
  
  this.updates.push({
    status: 'assigned',
    note: 'Request assigned to responder',
    updatedBy: assignedBy,
    updatedAt: new Date()
  });
  
  return await this.save();
};

// Method to resolve
emergencyRequestSchema.methods.resolve = async function(outcome, notes, resolvedBy) {
  this.status = 'resolved';
  this.timeline.resolvedAt = new Date();
  this.timeline.lastUpdatedAt = new Date();
  
  this.resolution = {
    resolvedBy,
    outcome,
    notes
  };
  
  this.updates.push({
    status: 'resolved',
    note: notes || 'Request resolved',
    updatedBy: resolvedBy,
    updatedAt: new Date()
  });
  
  return await this.save();
};

// Virtual for response time
emergencyRequestSchema.virtual('responseTime').get(function() {
  if (this.timeline.resolvedAt && this.timeline.reportedAt) {
    return Math.floor((this.timeline.resolvedAt - this.timeline.reportedAt) / (1000 * 60)); // Minutes
  }
  return null;
});

// Virtual for waiting time
emergencyRequestSchema.virtual('waitingTime').get(function() {
  const referenceTime = this.timeline.acknowledgedAt || new Date();
  return Math.floor((referenceTime - this.timeline.reportedAt) / (1000 * 60)); // Minutes
});

module.exports = mongoose.model('EmergencyRequest', emergencyRequestSchema);
