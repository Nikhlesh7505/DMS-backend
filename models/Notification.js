const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['alert', 'emergency', 'system', 'resource', 'task', 'approval', 'weather'],
    default: 'system',
    index: true
  },
  category: {
    type: String,
    default: 'general',
    trim: true
  },
  severity: {
    type: String,
    enum: ['info', 'watch', 'warning', 'danger', 'critical'],
    default: 'info'
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: Date,
  channels: [{
    type: String,
    enum: ['in_app', 'email', 'sms', 'push', 'dashboard']
  }],
  source: {
    module: String,
    entityType: String,
    entityId: mongoose.Schema.Types.Mixed
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: mongoose.Schema.Types.Mixed,
  expiresAt: Date
}, {
  timestamps: true
});

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'date' } } });

notificationSchema.statics.getForUser = function(userId, { limit = 20, unreadOnly = false } = {}) {
  const query = { user: userId };
  if (unreadOnly) {
    query.read = false;
  }

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit);
};

notificationSchema.methods.markAsRead = async function() {
  this.read = true;
  this.readAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);
