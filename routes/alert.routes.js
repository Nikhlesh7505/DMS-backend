/**
 * Alert Routes
 */

const express = require('express');
const router = express.Router();
const alertController = require('../controllers/alert.controller');
const { authenticate, isAdmin } = require('../middleware/auth.middleware');
const { alertValidation } = require('../middleware/validation.middleware');
const { auditAction } = require('../middleware/audit.middleware');

// Public routes
router.get('/', alertController.getAlerts);
router.get('/active', alertController.getActiveAlerts);
router.get('/critical', alertController.getCriticalAlerts);
router.get('/city/:city', alertController.getAlertsByCity);
router.get('/statistics/overview', authenticate, isAdmin, alertController.getStatistics);
router.get('/my-alerts', authenticate, alertController.getMyAlerts);
router.get('/unread-count', authenticate, alertController.getUnreadCount);
router.patch('/:id/read', authenticate, alertController.markAlertRead);
router.get('/:id', alertController.getAlert);

// Admin only
router.post(
  '/',
  authenticate,
  isAdmin,
  alertValidation.createAlert,
  auditAction({ action: 'create_alert', module: 'alerts', entityType: 'Alert' }),
  alertController.createAlert
);
router.put(
  '/:id',
  authenticate,
  isAdmin,
  auditAction({
    action: 'update_alert',
    module: 'alerts',
    entityType: 'Alert',
    entityIdResolver: (req) => req.params.id
  }),
  alertController.updateAlert
);
router.put(
  '/:id/acknowledge',
  authenticate,
  isAdmin,
  auditAction({
    action: 'acknowledge_alert',
    module: 'alerts',
    entityType: 'Alert',
    entityIdResolver: (req) => req.params.id
  }),
  alertController.acknowledgeAlert
);
router.put(
  '/:id/resolve',
  authenticate,
  isAdmin,
  auditAction({
    action: 'resolve_alert',
    module: 'alerts',
    entityType: 'Alert',
    entityIdResolver: (req) => req.params.id
  }),
  alertController.resolveAlert
);
router.put(
  '/:id/cancel',
  authenticate,
  isAdmin,
  auditAction({
    action: 'cancel_alert',
    module: 'alerts',
    entityType: 'Alert',
    entityIdResolver: (req) => req.params.id
  }),
  alertController.cancelAlert
);
router.post('/process-predictions', authenticate, isAdmin, alertController.processPredictions);
router.post(
  '/cleanup-duplicates',
  authenticate,
  isAdmin,
  auditAction({
    action: 'cleanup_duplicate_alerts',
    module: 'alerts',
    entityType: 'Alert'
  }),
  alertController.cleanupDuplicates
);
router.delete(
  '/:id',
  authenticate,
  isAdmin,
  auditAction({
    action: 'delete_alert',
    module: 'alerts',
    entityType: 'Alert',
    entityIdResolver: (req) => req.params.id
  }),
  alertController.deleteAlert
);

module.exports = router;
