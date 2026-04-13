/**
 * Rescue Task Model
 * Tracks rescue and relief operations
 */

const mongoose = require('mongoose');

const rescueTaskSchema = new mongoose.Schema({
  // Task identification
  taskId: {
    type: String,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: [true, 'Please provide a task title']
  },
  description: {
    type: String,
    required: true
  },
  
  // Task type
  type: {
    type: String,
    required: true,
    enum: [
      'search_rescue',
      'medical_evacuation',
      'food_distribution',
      'water_supply',
      'shelter_setup',
      'evacuation',
      'debris_clearance',
      'animal_rescue',
      'body_recovery',
      'relief_distribution',
      'infrastructure_repair',
      'communication_setup',
      'assessment',
      'other'
    ]
  },
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical', 'life_threatening'],
    default: 'medium'
  },
  
  // Status
  status: {
    type: String,
    enum: [
      'pending',
      'assigned',
      'in_progress',
      'en_route',
      'on_site',
      'in_progress',
      'completed',
      'on_hold',
      'cancelled',
      'failed'
    ],
    default: 'pending',
    index: true
  },
  
  // Related disaster
  disaster: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Disaster',
    required: true
  },
  
  // Related emergency request (if applicable)
  emergencyRequest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'EmergencyRequest'
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
    zone: String // Operational zone
  },
  
  // Assignment
  assignment: {
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    teamLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  
  // Team members
  teamMembers: [{
    member: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['team_lead', 'medic', 'rescuer', 'logistics', 'communication', 'volunteer', 'specialist']
    },
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Resources allocated
  resources: [{
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource'
    },
    quantity: Number,
    allocatedAt: {
      type: Date,
      default: Date.now
    },
    returned: { type: Boolean, default: false },
    returnedAt: Date
  }],
  
  // Timeline
  timeline: {
    createdAt: {
      type: Date,
      default: Date.now
    },
    assignedAt: Date,
    startedAt: Date,
    enRouteAt: Date,
    onSiteAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    estimatedDuration: Number, // in minutes
    actualDuration: Number // in minutes
  },
  
  // Schedule
  schedule: {
    startDate: Date,
    endDate: Date,
    isRecurring: { type: Boolean, default: false },
    recurrencePattern: String
  },
  
  // Requirements
  requirements: {
    personnel: {
      min: Number,
      max: Number,
      specializations: [String]
    },
    equipment: [String],
    vehicles: [String],
    skills: [String]
  },
  
  // Progress tracking
  progress: {
    percentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    milestones: [{
      description: String,
      completed: { type: Boolean, default: false },
      completedAt: Date,
      notes: String
    }],
    currentPhase: String
  },
  
  // Updates/notes
  updates: [{
    content: String,
    type: {
      type: String,
      enum: ['general', 'progress', 'issue', 'request', 'completion'],
      default: 'general'
    },
    location: {
      latitude: Number,
      longitude: Number
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    media: [{
      type: {
        type: String,
        enum: ['image', 'video']
      },
      url: String,
      caption: String
    }]
  }],
  
  // Outcome
  outcome: {
    result: {
      type: String,
      enum: ['successful', 'partial', 'failed', 'cancelled', 'ongoing']
    },
    summary: String,
    peopleHelped: Number,
    livesSaved: Number,
    propertySecured: String,
    challenges: [String],
    lessonsLearned: String
  },
  
  // Safety
  safety: {
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'extreme']
    },
    safetyBriefing: String,
    hazards: [String],
    requiredPPE: [String],
    incidents: [{
      description: String,
      severity: {
        type: String,
        enum: ['minor', 'moderate', 'serious', 'critical']
      },
      reportedAt: Date,
      resolvedAt: Date,
      actionTaken: String
    }]
  },
  
  // Weather conditions
  weatherConditions: {
    temperature: Number,
    conditions: String,
    visibility: String,
    notes: String
  },
  
  // Coordination
  coordination: {
    coordinatingWith: [{
      organization: String,
      contactPerson: String,
      contactNumber: String
    }],
    dependencies: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RescueTask'
    }]
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
rescueTaskSchema.index({ status: 1, priority: 1 });
rescueTaskSchema.index({ disaster: 1, status: 1 });
rescueTaskSchema.index({ 'assignment.team': 1, status: 1 });
rescueTaskSchema.index({ 'location.city': 1, status: 1 });
rescueTaskSchema.index({ 'timeline.createdAt': -1 });
rescueTaskSchema.index({ type: 1 });

// Pre-save middleware to generate task ID
rescueTaskSchema.pre('save', async function(next) {
  if (!this.taskId) {
    const date = new Date();
    const prefix = 'TSK';
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const typeCode = this.type.substring(0, 3).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    this.taskId = `${prefix}-${year}${month}-${typeCode}-${random}`;
  }
  next();
});

// Static method to get tasks by team
rescueTaskSchema.statics.getByTeam = function(teamId) {
  return this.find({ 'assignment.team': teamId })
    .sort({ 'timeline.createdAt': -1 });
};

// Static method to get active tasks
rescueTaskSchema.statics.getActive = function() {
  return this.find({
    status: { $in: ['assigned', 'in_progress', 'en_route', 'on_site'] }
  }).sort({ priority: -1, 'timeline.createdAt': 1 });
};

// Static method to get tasks by disaster
rescueTaskSchema.statics.getByDisaster = function(disasterId) {
  return this.find({ disaster: disasterId })
    .sort({ priority: -1, 'timeline.createdAt': -1 });
};

// Static method to get pending tasks for a team
rescueTaskSchema.statics.getPendingForTeam = function(teamId) {
  return this.find({
    'assignment.team': teamId,
    status: { $in: ['pending', 'assigned'] }
  }).sort({ priority: -1, 'timeline.createdAt': 1 });
};

// Static method to get statistics
rescueTaskSchema.statics.getStatistics = async function() {
  const statusStats = await this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
  
  const typeStats = await this.aggregate([
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        completed: {
          $sum: {
            $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
          }
        }
      }
    }
  ]);
  
  return { statusStats, typeStats };
};

// Method to update status
rescueTaskSchema.methods.updateStatus = async function(newStatus, note, userId) {
  this.status = newStatus;
  
  // Update timeline
  const timelineMap = {
    'assigned': 'assignedAt',
    'in_progress': 'startedAt',
    'en_route': 'enRouteAt',
    'on_site': 'onSiteAt',
    'completed': 'completedAt',
    'cancelled': 'cancelledAt'
  };
  
  if (timelineMap[newStatus]) {
    this.timeline[timelineMap[newStatus]] = new Date();
  }
  
  // Calculate actual duration if completed
  if (newStatus === 'completed' && this.timeline.startedAt) {
    this.timeline.actualDuration = Math.floor(
      (new Date() - this.timeline.startedAt) / (1000 * 60)
    );
    this.progress.percentage = 100;
    this.outcome.result = 'successful';
  }
  
  // Add update
  this.updates.push({
    content: note || `Status updated to ${newStatus}`,
    type: 'progress',
    updatedBy: userId,
    updatedAt: new Date()
  });
  
  return await this.save();
};

// Method to add progress update
rescueTaskSchema.methods.addProgress = async function(percentage, note, userId) {
  this.progress.percentage = Math.min(100, Math.max(0, percentage));
  
  if (note) {
    this.updates.push({
      content: note,
      type: 'progress',
      updatedBy: userId,
      updatedAt: new Date()
    });
  }
  
  // Auto-update status based on progress
  if (this.progress.percentage === 100 && this.status !== 'completed') {
    this.status = 'completed';
    this.timeline.completedAt = new Date();
    this.outcome.result = 'successful';
  } else if (this.progress.percentage > 0 && this.status === 'assigned') {
    this.status = 'in_progress';
    this.timeline.startedAt = new Date();
  }
  
  return await this.save();
};

// Method to add team member
rescueTaskSchema.methods.addTeamMember = async function(memberId, role) {
  const exists = this.teamMembers.some(
    m => m.member.toString() === memberId
  );
  
  if (!exists) {
    this.teamMembers.push({
      member: memberId,
      role: role || 'volunteer',
      joinedAt: new Date()
    });
    return await this.save();
  }
  
  return this;
};

// Method to complete task
rescueTaskSchema.methods.complete = async function(outcome, summary, userId) {
  this.status = 'completed';
  this.timeline.completedAt = new Date();
  this.progress.percentage = 100;
  
  this.outcome = {
    ...this.outcome,
    result: outcome || 'successful',
    summary
  };
  
  this.updates.push({
    content: `Task completed: ${summary}`,
    type: 'completion',
    updatedBy: userId,
    updatedAt: new Date()
  });
  
  return await this.save();
};

// Virtual for task age
rescueTaskSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.timeline.createdAt) / (1000 * 60 * 60)); // Hours
});

// Virtual for time elapsed since assignment
rescueTaskSchema.virtual('timeSinceAssignment').get(function() {
  if (this.timeline.assignedAt) {
    return Math.floor((Date.now() - this.timeline.assignedAt) / (1000 * 60)); // Minutes
  }
  return null;
});

module.exports = mongoose.model('RescueTask', rescueTaskSchema);
