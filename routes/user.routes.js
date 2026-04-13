/**
 * User Routes
 */

const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, authorize, isAdmin } = require('../middleware/auth.middleware');
const { userValidation } = require('../middleware/validation.middleware');

// All routes require authentication
router.use(authenticate);

// Profile routes
router.get('/profile', userController.getProfile);
router.put('/profile', userValidation.updateProfile, userController.updateProfile);
router.put('/organization', userController.updateOrganization);
router.put('/availability', userController.updateAvailability);

// Admin only routes
router.get('/', isAdmin, userController.getUsers);
router.get('/pending-approvals', isAdmin, userController.getPendingApprovals);
router.put('/:id/approve', isAdmin, userValidation.approveUser, userController.approveUser);
router.put('/:id/deactivate', isAdmin, userController.deactivateUser);
router.delete('/:id', isAdmin, userController.deleteUser);

// Role-based routes
router.get('/by-role/:role', isAdmin, userController.getUsersByRole);
router.get('/rescue-teams/available', userController.getAvailableRescueTeams);

// Single user routes
router.get('/:id', userController.getUser);

module.exports = router;
