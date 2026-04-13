/**
 * Disaster Model
 * Tracks active and historical disasters
 */

const mongoose = require('mongoose');

const disasterSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Please provide a disaster name'],
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'flood',
      'cyclone',
      'earthquake',
      'tsunami',
      'drought',
      'heatwave',
      'wildfire',
      'landslide',
      'storm',
      'pandemic',
      'chemical',
      'industrial',
      'other'
    ]
  },
  description: {
    type: String,
    required: true
  },
  
  // Severity and status
  severity: {
    type: String,
    enum: ['low', 'moderate', 'high', 'severe', 'catastrophic'],
    required: true
  },
  status: {
    type: String,
    enum: ['monitoring', 'active', 'contained', 'resolved', 'archived'],
    default: 'monitoring'
  },
  
  // Location information
  location: {
    address: String,
    city: {
      type: String,
      required: true,
      index: true
    },
    state: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: 'India'
    },
    coordinates: {
      latitude: Number,
      longitude: Number
    },
    affectedArea: {
      radius: Number, // in kilometers
      description: String
    }
  },
  
  // Timeline
  timeline: {
    detectedAt: {
      type: Date,
      default: Date.now
    },
    startedAt: {
      type: Date
    },
    expectedEndAt: {
      type: Date
    },
    endedAt: {
      type: Date
    }
  },
  
  // Impact assessment
  impact: {
    affectedPopulation: {
      type: Number,
      default: 0
    },
    evacuatedPopulation: {
      type: Number,
      default: 0
    },
    casualties: {
      confirmed: { type: Number, default: 0 },
      estimated: { type: Number, default: 0 }
    },
    injuries: {
      type: Number,
      default: 0
    },
    missingPersons: {
      type: Number,
      default: 0
    },
    infrastructureDamage: {
      type: String,
      enum: ['none', 'minor', 'moderate', 'severe', 'extensive']
    },
    economicLoss: {
      estimated: Number, // in local currency
      currency: { type: String, default: 'INR' }
    }
  },
  
  // Weather conditions that triggered this disaster
  triggeringConditions: {
    weatherDataId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WeatherData'
    },
    rainfall: Number,
    temperature: Number,
    windSpeed: Number,
    pressure: Number,
    description: String
  },
  
  // Response coordination
  response: {
    incidentCommander: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    responseTeams: [{
      team: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      assignedAt: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['assigned', 'en_route', 'on_site', 'completed', 'withdrawn'],
        default: 'assigned'
      }
    }],
    resourcesDeployed: [{
      resource: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resource'
      },
      quantity: Number,
      deployedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  
  // Related alerts
  alerts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Alert'
  }],
  
  // Related emergency requests
  emergencyRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmergencyRequest'
  }],
  
  // Related rescue tasks
  rescueTasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RescueTask'
  }],
  
  // Media and documents
  media: [{
    type: {
      type: String,
      enum: ['image', 'video', 'document']
    },
    url: String,
    caption: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Updates and notes
  updates: [{
    content: String,
    type: {
      type: String,
      enum: ['general', 'situation', 'response', 'evacuation', 'relief', 'weather'],
      default: 'general'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Source of disaster report
  source: {
    type: {
      type: String,
      enum: ['automatic', 'manual', 'citizen_report', 'sensor', 'satellite', 'weather_service'],
      default: 'automatic'
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    externalSource: String
  },
  
  // Created by
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes
disasterSchema.index({ status: 1 });
disasterSchema.index({ type: 1 });
disasterSchema.index({ severity: 1 });
disasterSchema.index({ 'location.city': 1 });
disasterSchema.index({ 'location.state': 1 });
disasterSchema.index({ 'timeline.detectedAt': -1 });
disasterSchema.index({ 'impact.affectedPopulation': 1 });

// Compound index for active disasters by location
disasterSchema.index({ 
  'location.city': 1, 
  status: 1 
});

// Static method to get active disasters
disasterSchema.statics.getActive = function() {
  return this.find({
    status: { $in: ['monitoring', 'active', 'contained'] }
  }).sort({ 'timeline.detectedAt': -1 });
};

// Static method to get disasters by city
disasterSchema.statics.getByCity = function(city) {
  return this.find({ 'location.city': city })
    .sort({ 'timeline.detectedAt': -1 });
};

// Static method to get disaster statistics
disasterSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        active: {
          $sum: {
            $cond: [{ $in: ['$status', ['monitoring', 'active', 'contained']] }, 1, 0]
          }
        },
        totalAffected: { $sum: '$impact.affectedPopulation' },
        totalCasualties: { $sum: '$impact.casualties.confirmed' }
      }
    }
  ]);
  
  return stats;
};

// Method to add update
disasterSchema.methods.addUpdate = async function(content, type, userId) {
  this.updates.push({
    content,
    type,
    createdBy: userId
  });
  return await this.save();
};

// Method to assign response team
disasterSchema.methods.assignTeam = async function(teamId) {
  const existingAssignment = this.response.responseTeams.find(
    rt => rt.team.toString() === teamId
  );
  
  if (!existingAssignment) {
    this.response.responseTeams.push({
      team: teamId,
      assignedAt: new Date()
    });
    return await this.save();
  }
  
  return this;
};

// Virtual for duration
disasterSchema.virtual('duration').get(function() {
  const start = this.timeline.startedAt || this.timeline.detectedAt;
  const end = this.timeline.endedAt || new Date();
  return Math.floor((end - start) / (1000 * 60 * 60 * 24)); // Days
});

module.exports = mongoose.model('Disaster', disasterSchema);
