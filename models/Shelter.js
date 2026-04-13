const mongoose = require('mongoose');

const shelterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    uppercase: true
  },
  status: {
    type: String,
    enum: ['active', 'full', 'inactive', 'maintenance'],
    default: 'active',
    index: true
  },
  address: {
    line1: { type: String, required: true },
    line2: String,
    city: { type: String, required: true, index: true },
    state: { type: String, required: true },
    postalCode: String,
    country: { type: String, default: 'India' }
  },
  geoLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2,
        message: 'Geo coordinates must be [longitude, latitude]'
      }
    }
  },
  capacity: {
    total: { type: Number, default: 0 },
    occupied: { type: Number, default: 0 },
    available: { type: Number, default: 0 }
  },
  contact: {
    name: String,
    phone: String,
    email: String
  },
  facilities: {
    medical: { type: Boolean, default: false },
    food: { type: Boolean, default: false },
    water: { type: Boolean, default: false },
    powerBackup: { type: Boolean, default: false },
    womenFriendly: { type: Boolean, default: false },
    childFriendly: { type: Boolean, default: false },
    petFriendly: { type: Boolean, default: false },
    sanitation: { type: Boolean, default: true }
  },
  accessibility: {
    wheelchairAccessible: { type: Boolean, default: false },
    hearingSupport: { type: Boolean, default: false },
    visualSupport: { type: Boolean, default: false }
  },
  supportedDisasters: [{
    type: String,
    enum: ['flood', 'cyclone', 'earthquake', 'heatwave', 'landslide', 'wildfire', 'general']
  }],
  managedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: String
}, {
  timestamps: true
});

shelterSchema.index({ geoLocation: '2dsphere' });
shelterSchema.index({ 'address.city': 1, status: 1 });

shelterSchema.pre('validate', function(next) {
  const total = this.capacity?.total || 0;
  const occupied = this.capacity?.occupied || 0;
  this.capacity.available = Math.max(0, total - occupied);
  if (total > 0 && occupied >= total) {
    this.status = this.status === 'inactive' || this.status === 'maintenance' ? this.status : 'full';
  }
  next();
});

shelterSchema.statics.findNearby = function(longitude, latitude, maxDistance = 50000, filters = {}) {
  return this.find({
    ...filters,
    geoLocation: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    }
  }).limit(10);
};

module.exports = mongoose.model('Shelter', shelterSchema);
