/**
 * Resource Model
 * Tracks available resources and their allocation
 */

const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
  // Resource identification
  name: {
    type: String,
    required: [true, 'Please provide a resource name'],
    trim: true
  },
  description: {
    type: String
  },
  
  // Resource category
  category: {
    type: String,
    required: true,
    enum: [
      'medical',
      'rescue_equipment',
      'vehicle',
      'communication',
      'food_water',
      'shelter',
      'clothing',
      'fuel',
      'power',
      'personnel',
      'financial',
      'other'
    ],
    index: true
  },
  
  // Resource type (sub-category)
  type: {
    type: String,
    required: true
  },
  
  // Quantity tracking
  quantity: {
    total: {
      type: Number,
      required: true,
      min: 0
    },
    available: {
      type: Number,
      required: true,
      min: 0
    },
    reserved: {
      type: Number,
      default: 0,
      min: 0
    },
    deployed: {
      type: Number,
      default: 0,
      min: 0
    },
    unit: {
      type: String,
      required: true,
      enum: ['units', 'kg', 'liters', 'pieces', 'sets', 'vehicles', 'personnel', 'boxes', 'kits', 'other']
    }
  },
  
  // Resource owner/manager
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  organization: {
    name: String,
    type: {
      type: String,
      enum: ['government', 'ngo', 'private', 'international']
    }
  },
  
  // Location
  location: {
    address: String,
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
    storageFacility: String
  },
  
  // Status
  status: {
    type: String,
    enum: ['available', 'in_use', 'depleted', 'maintenance', 'in_transit', 'reserved'],
    default: 'available',
    index: true
  },
  
  // Condition
  condition: {
    type: String,
    enum: ['new', 'good', 'fair', 'poor', 'damaged'],
    default: 'good'
  },
  
  // Specifications
  specifications: {
    brand: String,
    model: String,
    capacity: String,
    specifications: mongoose.Schema.Types.Mixed // Flexible field for specific details
  },
  
  // Availability schedule
  availability: {
    is24Hour: { type: Boolean, default: true },
    schedule: [{
      day: {
        type: String,
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
      },
      openTime: String,
      closeTime: String
    }],
    specialInstructions: String
  },
  
  // Contact information
  contact: {
    name: String,
    phone: String,
    email: String,
    alternativePhone: String
  },
  
  // Deployment history
  deployments: [{
    disaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Disaster'
    },
    quantity: Number,
    deployedAt: Date,
    returnedAt: Date,
    location: String,
    notes: String
  }],
  
  // Maintenance records
  maintenance: [{
    date: Date,
    type: {
      type: String,
      enum: ['routine', 'repair', 'inspection', 'replacement']
    },
    description: String,
    cost: Number,
    performedBy: String,
    nextDue: Date
  }],
  
  // Cost/Value
  value: {
    unitCost: Number,
    currency: { type: String, default: 'INR' },
    totalValue: Number
  },
  
  // Procurement
  procurement: {
    purchaseDate: Date,
    supplier: String,
    warrantyExpiry: Date,
    expectedLifespan: Number // in years
  },
  
  // Expiry (for consumables)
  expiry: {
    hasExpiry: { type: Boolean, default: false },
    expiryDate: Date,
    batchNumber: String
  },
  
  // Tags for search
  tags: [String],
  
  // Notes
  notes: String,
  
  // Last updated
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
resourceSchema.index({ category: 1, status: 1 });
resourceSchema.index({ 'location.city': 1, category: 1 });
resourceSchema.index({ owner: 1 });
resourceSchema.index({ type: 1 });
resourceSchema.index({ tags: 1 });
resourceSchema.index({ 'quantity.available': 1 });

// Pre-save middleware to calculate totals
resourceSchema.pre('save', function(next) {
  // Ensure available + reserved + deployed = total
  const used = (this.quantity.reserved || 0) + (this.quantity.deployed || 0);
  this.quantity.available = Math.max(0, this.quantity.total - used);
  
  // Update status based on availability
  if (this.quantity.available === 0) {
    this.status = 'depleted';
  } else if (this.status === 'depleted' && this.quantity.available > 0) {
    this.status = 'available';
  }
  
  // Update lastUpdated
  this.lastUpdated = new Date();
  
  next();
});

// Static method to get available resources by category
resourceSchema.statics.getAvailableByCategory = function(category, city) {
  const query = {
    category,
    'quantity.available': { $gt: 0 },
    status: { $in: ['available', 'reserved'] }
  };
  
  if (city) {
    query['location.city'] = city;
  }
  
  return this.find(query).sort({ 'quantity.available': -1 });
};

// Static method to get resources by owner
resourceSchema.statics.getByOwner = function(ownerId) {
  return this.find({ owner: ownerId }).sort({ category: 1, name: 1 });
};

// Static method to get low stock resources
resourceSchema.statics.getLowStock = function(threshold = 10) {
  return this.find({
    'quantity.available': { $lte: threshold, $gt: 0 }
  }).sort({ 'quantity.available': 1 });
};

// Static method to get resource statistics
resourceSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$category',
        totalResources: { $sum: '$quantity.total' },
        availableResources: { $sum: '$quantity.available' },
        deployedResources: { $sum: '$quantity.deployed' },
        count: { $sum: 1 }
      }
    }
  ]);
  
  return stats;
};

// Method to allocate resources
resourceSchema.methods.allocate = async function(quantity, disasterId, notes) {
  if (this.quantity.available < quantity) {
    throw new Error('Insufficient resources available');
  }
  
  this.quantity.reserved += quantity;
  this.quantity.available -= quantity;
  
  if (disasterId) {
    this.deployments.push({
      disaster: disasterId,
      quantity,
      deployedAt: new Date(),
      notes
    });
  }
  
  return await this.save();
};

// Method to deploy resources
resourceSchema.methods.deploy = async function(quantity, disasterId, location, notes) {
  if (this.quantity.reserved < quantity) {
    throw new Error('Insufficient reserved resources');
  }
  
  this.quantity.reserved -= quantity;
  this.quantity.deployed += quantity;
  this.status = 'in_use';
  
  // Update deployment record
  const deployment = this.deployments.find(
    d => d.disaster.toString() === disasterId && !d.returnedAt
  );
  
  if (deployment) {
    deployment.quantity += quantity;
    deployment.location = location;
  }
  
  return await this.save();
};

// Method to return resources
resourceSchema.methods.return = async function(quantity, disasterId, notes) {
  if (this.quantity.deployed < quantity) {
    throw new Error('Cannot return more than deployed quantity');
  }
  
  this.quantity.deployed -= quantity;
  this.quantity.available += quantity;
  
  // Update deployment record
  const deployment = this.deployments.find(
    d => d.disaster.toString() === disasterId && !d.returnedAt
  );
  
  if (deployment) {
    deployment.returnedAt = new Date();
    deployment.notes = notes || deployment.notes;
  }
  
  // Update status
  if (this.quantity.deployed === 0 && this.quantity.reserved === 0) {
    this.status = 'available';
  }
  
  return await this.save();
};

// Method to add stock
resourceSchema.methods.addStock = async function(quantity, notes) {
  this.quantity.total += quantity;
  this.quantity.available += quantity;
  
  this.notes = this.notes 
    ? `${this.notes}\n[${new Date().toISOString()}] Added ${quantity} units. ${notes}`
    : `[${new Date().toISOString()}] Added ${quantity} units. ${notes}`;
  
  return await this.save();
};

// Virtual for utilization rate
resourceSchema.virtual('utilizationRate').get(function() {
  if (this.quantity.total === 0) return 0;
  return Math.round(((this.quantity.deployed + this.quantity.reserved) / this.quantity.total) * 100);
});

module.exports = mongoose.model('Resource', resourceSchema);
