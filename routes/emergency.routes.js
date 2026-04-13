/**
 * Emergency Request Routes
 */

const express = require('express');
const router = express.Router();
const emergencyController = require('../controllers/emergency.controller');
const { authenticate, isAdmin, isResponder } = require('../middleware/auth.middleware');
const { emergencyValidation } = require('../middleware/validation.middleware');
const { auditAction } = require('../middleware/audit.middleware');

// Protected routes
router.use(authenticate);

// Citizen routes
router.post(
  '/',
  emergencyValidation.createRequest,
  auditAction({ action: 'create_emergency_request', module: 'emergency', entityType: 'EmergencyRequest' }),
  emergencyController.createRequest
);
router.get('/my-requests', emergencyController.getMyRequests);
router.put('/:id/cancel', emergencyValidation.requestId, emergencyController.cancelRequest);

// Responder routes
router.get('/assigned-to-me', isResponder, emergencyController.getAssignedRequests);
router.get('/pending', isResponder, emergencyController.getPendingRequests);
router.put(
  '/:id/status',
  isResponder,
  emergencyValidation.updateStatus,
  auditAction({
    action: 'update_emergency_status',
    module: 'emergency',
    entityType: 'EmergencyRequest',
    entityIdResolver: (req) => req.params.id
  }),
  emergencyController.updateStatus
);
router.put(
  '/:id/acknowledge',
  isResponder,
  auditAction({
    action: 'acknowledge_emergency_request',
    module: 'emergency',
    entityType: 'EmergencyRequest',
    entityIdResolver: (req) => req.params.id
  }),
  emergencyController.acknowledgeRequest
);
router.post('/:id/updates', isResponder, emergencyController.addUpdate);
router.put(
  '/:id/resolve',
  isResponder,
  auditAction({
    action: 'resolve_emergency_request',
    module: 'emergency',
    entityType: 'EmergencyRequest',
    entityIdResolver: (req) => req.params.id
  }),
  emergencyController.resolveRequest
);

// Admin/Responder routes
router.get('/', isResponder, emergencyController.getRequests);
router.get('/statistics/overview', isAdmin, emergencyController.getStatistics);
router.put(
  '/:id/assign',
  isResponder,
  auditAction({
    action: 'assign_emergency_request',
    module: 'emergency',
    entityType: 'EmergencyRequest',
    entityIdResolver: (req) => req.params.id
  }),
  emergencyController.assignRequest
);

// Shared / General routes
router.delete(
  '/:id',
  emergencyValidation.requestId,
  auditAction({
    action: 'delete_emergency_request',
    module: 'emergency',
    entityType: 'EmergencyRequest',
    entityIdResolver: (req) => req.params.id
  }),
  emergencyController.deleteRequest
);

router.get('/:id', emergencyController.getRequest);

module.exports = router;
