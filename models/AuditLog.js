const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  actorRole: String,
  action: {
    type: String,
    required: true,
    index: true
  },
  module: {
    type: String,
    index: true
  },
  entityType: {
    type: String,
    index: true
  },
  entityId: mongoose.Schema.Types.Mixed,
  status: {
    type: String,
    enum: ['success', 'failure', 'warning'],
    default: 'success'
  },
  method: String,
  path: String,
  ipAddress: String,
  userAgent: String,
  requestId: String,
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

auditLogSchema.index({ createdAt: -1, module: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
