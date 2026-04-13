/**
 * Dashboard Routes
 */

const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate, authorize, isAdmin } = require('../middleware/auth.middleware');

// Public routes
router.get('/public', dashboardController.getPublicDashboard);
router.get('/map-data', dashboardController.getMapData);

// Protected routes
router.use(authenticate);

// Role-based dashboards
router.get('/admin', isAdmin, dashboardController.getAdminDashboard);
router.get('/responder', authorize('admin', 'ngo', 'rescue_team'), dashboardController.getResponderDashboard);
router.get('/citizen', authorize('admin', 'citizen'), dashboardController.getCitizenDashboard);

// Analytics (Admin only)
router.get('/analytics', isAdmin, dashboardController.getAnalytics);

module.exports = router;
