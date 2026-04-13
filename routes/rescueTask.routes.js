/**
 * Rescue Task Routes
 */

const express = require('express');
const router = express.Router();
const rescueTaskController = require('../controllers/rescueTask.controller');
const { authenticate, isAdmin, isResponder } = require('../middleware/auth.middleware');
const { rescueTaskValidation } = require('../middleware/validation.middleware');

// Protected routes
router.use(authenticate);

// All authenticated users
router.get('/', rescueTaskController.getTasks);
router.get('/active', rescueTaskController.getActiveTasks);
router.get('/my-tasks', rescueTaskController.getMyTasks);
router.get('/pending-for-me', rescueTaskController.getPendingTasks);
router.get('/disaster/:disasterId', rescueTaskController.getTasksByDisaster);

// Admin routes
router.post('/', isAdmin, rescueTaskValidation.createTask, rescueTaskController.createTask);
router.put('/:id', isAdmin, rescueTaskController.updateTask);
router.post('/:id/team-members', isAdmin, rescueTaskController.addTeamMember);
router.get('/statistics/overview', isAdmin, rescueTaskController.getStatistics);
router.delete('/:id', isAdmin, rescueTaskController.deleteTask);

// Responder routes (assigned team members)
router.put('/:id/status', isResponder, rescueTaskController.updateStatus);
router.post('/:id/progress', isResponder, rescueTaskController.addProgress);
router.put('/:id/complete', isResponder, rescueTaskController.completeTask);

// Keep parameterized routes last so they do not swallow literal paths
router.get('/:id', rescueTaskController.getTask);

module.exports = router;
