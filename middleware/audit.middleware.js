const AuditLog = require('../models/AuditLog');

const auditAction = ({
  action,
  module,
  entityType,
  entityIdResolver,
  metadataResolver
}) => {
  return (req, res, next) => {
    res.on('finish', () => {
      if (!action || res.statusCode >= 500) {
        return;
      }

      AuditLog.create({
        actor: req.user?._id,
        actorRole: req.user?.role,
        action,
        module,
        entityType,
        entityId: typeof entityIdResolver === 'function' ? entityIdResolver(req, res) : undefined,
        status: res.statusCode >= 400 ? 'failure' : 'success',
        method: req.method,
        path: req.originalUrl,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.requestId,
        metadata: typeof metadataResolver === 'function' ? metadataResolver(req, res) : undefined
      }).catch((error) => {
        console.error('Audit log write failed:', error.message);
      });
    });

    next();
  };
};

module.exports = {
  auditAction
};
