/**
 * Resource Routes
 */

const express = require('express');
const router = express.Router();
const resourceController = require('../controllers/resource.controller');
const { authenticate, isAdmin, authorize } = require('../middleware/auth.middleware');
const { resourceValidation } = require('../middleware/validation.middleware');

// Public routes
router.get('/', resourceController.getResources);
router.get('/available/:category', resourceController.getAvailableByCategory);

// Protected routes
router.use(authenticate);

// All authenticated users
router.get('/my-resources', resourceController.getMyResources);

// Admin and NGO routes
router.post('/', authorize('admin', 'ngo', 'rescue_team'), resourceValidation.createResource, resourceController.createResource);
router.put('/:id', resourceController.updateResource);
router.post('/:id/add-stock', resourceController.addStock);

// Admin only
router.get('/low-stock', isAdmin, resourceController.getLowStock);
router.get('/statistics/overview', isAdmin, resourceController.getStatistics);
router.post('/:id/allocate', isAdmin, resourceValidation.allocateResource, resourceController.allocateResource);
router.post('/:id/deploy', isAdmin, resourceController.deployResource);
router.post('/:id/return', isAdmin, resourceController.returnResource);
router.delete('/:id', isAdmin, resourceController.deleteResource);

// Keep parameterized routes last so they do not swallow literal paths
router.get('/:id', resourceController.getResource);

module.exports = router;
