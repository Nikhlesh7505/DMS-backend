const express = require('express');
const router = express.Router();
const {
  getDonations,
  getPendingDonations,
  getMyDonations,
  getDonationById,
  createDonation,
  updateDonation,
  acceptDonation,
  assignVolunteer,
  getVolunteerTasks,
  respondToTask,
  completeTask,
  cancelAcceptance,
  updateDonationStatus,
  deleteDonation,
  adminDeleteWithFeedback
} = require('../controllers/donation.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// All routes require authentication
router.use(authenticate);

// Citizen routes
router.post('/', authorize('citizen', 'admin'), createDonation);
router.get('/my', getMyDonations);
router.put('/:id', authorize('citizen', 'admin'), updateDonation);

// NGO routes
router.get('/pending', authorize('ngo', 'admin'), getPendingDonations);
router.post('/:id/accept', authorize('ngo'), acceptDonation);
router.post('/:id/assign-volunteer', authorize('ngo'), assignVolunteer);
router.post('/:id/cancel-acceptance', authorize('ngo'), cancelAcceptance);
router.patch('/:id/status', authorize('ngo', 'admin'), updateDonationStatus);

// Volunteer routes
router.get('/volunteer-tasks', authorize('volunteer'), getVolunteerTasks);
router.patch('/:id/respond-task', authorize('volunteer'), respondToTask);
router.patch('/:id/complete-task', authorize('volunteer'), completeTask);

// Admin routes
router.delete('/:id/admin', authorize('admin'), adminDeleteWithFeedback);

// NGO/Admin routes
router.get('/', authorize('ngo', 'admin'), getDonations);

// Common routes
router.get('/:id', getDonationById);
router.delete('/:id', deleteDonation);

module.exports = router;
