/**
 * Disaster Routes
 */

const express = require('express');
const router = express.Router();
const disasterController = require('../controllers/disaster.controller');
const { authenticate, isAdmin, isResponder } = require('../middleware/auth.middleware');
const { disasterValidation } = require('../middleware/validation.middleware');

// Public routes
router.get('/', disasterController.getDisasters);
router.get('/active', disasterController.getActiveDisasters);
router.get('/city/:city', disasterController.getDisastersByCity);
router.get('/statistics/overview', disasterController.getStatistics);
router.get('/:id', disasterController.getDisaster);

// Protected routes
router.use(authenticate);

// Admin only
router.post('/', isAdmin, disasterValidation.createDisaster, disasterController.createDisaster);
router.put('/:id', isAdmin, disasterController.updateDisaster);
router.put('/:id/status', isAdmin, disasterController.updateStatus);
router.delete('/:id', isAdmin, disasterController.deleteDisaster);

// Admin and Responder
router.post('/:id/updates', isResponder, disasterController.addUpdate);
router.post('/:id/assign-team', isAdmin, disasterController.assignTeam);

module.exports = router;
