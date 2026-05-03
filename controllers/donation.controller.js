/**
 * Donation Controller
 * Handles donation lifecycle operations
 */

const Donation = require('../models/Donation');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @desc    Get all donations
 * @route   GET /api/donations
 * @access  Private/NGO/Admin
 */
const getDonations = asyncHandler(async (req, res) => {
  const { status, category, city, flagged, page = 1, limit = 20 } = req.query;

  // Build query
  const query = {};
  if (status) query.status = status;
  if (category) query.category = category;
  if (city) query.city = city;
  if (flagged === 'true') query.flagged = true;
  
  // Enforce NGO-level isolation: NGOs only see their own assigned donations or specifically requested pending ones
  if (req.user.role === 'ngo') {
    if (status === 'Pending') {
      query.assignedNGO = null;
    } else {
      query.assignedNGO = req.user.id;
    }
  } else if (req.query.assignedNGO) {
    query.assignedNGO = req.query.assignedNGO;
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const donations = await Donation.find(query)
    .populate('userId', 'name email phone')
    .populate('assignedNGO', 'name email phone organization')
    .populate('assignedVolunteer', 'name email phone location')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await Donation.countDocuments(query);

  res.json({
    success: true,
    data: {
      donations,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * @desc    Get pending donations
 * @route   GET /api/donations/pending
 * @access  Private/NGO
 */
const getPendingDonations = asyncHandler(async (req, res) => {
  const { category, city } = req.query;
  const query = { status: 'Pending', assignedNGO: null };
  if (category) query.category = category;
  if (city) query.city = city;

  const donations = await Donation.find(query)
    .populate('userId', 'name email phone')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: { donations }
  });
});

/**
 * @desc    Get current user's donations
 * @route   GET /api/donations/my
 * @access  Private
 */
const getMyDonations = asyncHandler(async (req, res) => {
  const donations = await Donation.find({ userId: req.user.id })
    .populate('assignedNGO', 'name email phone organization')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: { donations }
  });
});

/**
 * @desc    Get single donation by ID (tracking)
 * @route   GET /api/donations/:id
 * @access  Private
 */
const getDonationById = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id)
    .populate('userId', 'name email phone avatar')
    .populate('assignedNGO', 'name email phone organization')
    .populate('assignedVolunteer', 'name email phone location');

  if (!donation) {
    return res.status(404).json({
      success: false,
      message: 'Donation not found'
    });
  }

  const isOwner = donation.userId._id.toString() === req.user.id;
  const isAuthorizedRole = ['ngo', 'admin', 'rescue_team'].includes(req.user.role);

  if (!isOwner && !isAuthorizedRole) {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to view this donation tracking'
    });
  }

  res.json({
    success: true,
    data: { donation }
  });
});

/**
 * @desc    Create new donation
 * @route   POST /api/donations
 * @access  Private/Citizen
 */
const createDonation = asyncHandler(async (req, res) => {
  const donationData = {
    ...req.body,
    userId: req.user.id,
    status: 'Pending'
  };

  const donation = await Donation.create(donationData);

  res.status(201).json({
    success: true,
    message: 'Donation submitted successfully. Thank you for your contribution!',
    data: { donation }
  });
});

/**
 * @desc    Update donation details
 * @route   PUT /api/donations/:id
 * @access  Private/Owner
 */
const updateDonation = asyncHandler(async (req, res) => {
  let donation = await Donation.findById(req.params.id);

  if (!donation) {
    return res.status(404).json({
      success: false,
      message: 'Donation not found'
    });
  }

  if (donation.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to update this donation'
    });
  }

  if (donation.status !== 'Pending' && req.user.role !== 'admin') {
    return res.status(400).json({
      success: false,
      message: `Cannot update donation with status: ${donation.status}`
    });
  }

  donation = await Donation.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.json({
    success: true,
    message: 'Donation updated successfully',
    data: { donation }
  });
});

/**
 * @desc    NGO accepts a donation (Atomic update)
 * @route   POST /api/donations/:id/accept
 * @access  Private/NGO
 */
const acceptDonation = asyncHandler(async (req, res) => {
  if (req.user.role !== 'ngo') {
    return res.status(403).json({ success: false, message: 'Only NGOs can accept donations' });
  }

  // Atomic update to prevent race conditions
  const donation = await Donation.findOneAndUpdate(
    { _id: req.params.id, assignedNGO: null, status: 'Pending' },
    { 
      $set: { 
        assignedNGO: req.user.id, 
        status: 'Accepted', 
        acceptedAt: new Date() 
      } 
    },
    { new: true }
  );

  if (!donation) {
    return res.status(409).json({
      success: false,
      message: 'Donation already accepted by another NGO or not found in Pending state'
    });
  }

  res.json({
    success: true,
    message: 'Donation accepted successfully',
    data: { donation }
  });
});

/**
 * @desc    NGO assigns a volunteer to an accepted donation
 * @route   POST /api/donations/:id/assign-volunteer
 * @access  Private/NGO
 */
const assignVolunteer = asyncHandler(async (req, res) => {
  const { volunteerId, name, contact, expectedTime } = req.body;

  let donation = await Donation.findOne({ _id: req.params.id, assignedNGO: req.user.id });

  if (!donation) {
    return res.status(404).json({ success: false, message: 'Donation not found or not assigned to you' });
  }

  // Update assignment
  donation.assignedVolunteer = volunteerId || null;
  donation.volunteerDetails = { 
    name: name || donation.volunteerDetails?.name, 
    contact: contact || donation.volunteerDetails?.contact, 
    expectedTime 
  };
  donation.status = 'Assigned';
  donation.assignmentDate = new Date();
  
  await donation.save();

  // Notify volunteer if linked user exists
  if (volunteerId) {
    const { emitToUser } = require('../config/socket');
    emitToUser(volunteerId, 'donation:assigned', { 
      donationId: donation._id,
      ngoName: req.user.name
    });
  }

  res.json({
    success: true,
    message: 'Volunteer assigned successfully',
    data: { donation }
  });
});

/**
 * @desc    Get tasks assigned to the volunteer
 * @route   GET /api/donations/volunteer-tasks
 * @access  Private/Volunteer
 */
const getVolunteerTasks = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const query = { assignedVolunteer: req.user.id };
  
  if (status) {
    query.status = status;
  }

  const donations = await Donation.find(query)
    .populate('userId', 'name phone')
    .populate('assignedNGO', 'name organization phone email')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: { donations }
  });
});

/**
 * @desc    Volunteer responds to a task (Accept/Reject)
 * @route   PATCH /api/donations/:id/respond-task
 * @access  Private/Volunteer
 */
const respondToTask = asyncHandler(async (req, res) => {
  const { action, feedback } = req.body; // action: 'accept' or 'reject'
  
  const donation = await Donation.findOne({ _id: req.params.id, assignedVolunteer: req.user.id });

  if (!donation) {
    return res.status(404).json({ success: false, message: 'Task not found or not assigned to you' });
  }

  if (action === 'accept') {
    donation.status = 'In Process';
  } else if (action === 'reject') {
    if (!feedback) {
      return res.status(400).json({ success: false, message: 'Feedback is required for rejection' });
    }
    donation.status = 'Rejected by Volunteer';
    donation.volunteerFeedback = feedback;
  } else {
    return res.status(400).json({ success: false, message: 'Invalid action' });
  }

  await donation.save();

  // Notify NGO
  if (donation.assignedNGO) {
    const { emitToUser } = require('../config/socket');
    emitToUser(donation.assignedNGO.toString(), 'donation:volunteer_response', {
      donationId: donation._id,
      status: donation.status,
      volunteerName: req.user.name
    });
  }

  res.json({
    success: true,
    message: `Task ${action === 'accept' ? 'accepted' : 'rejected'} successfully`,
    data: { donation }
  });
});

/**
 * @desc    Volunteer marks task as completed
 * @route   PATCH /api/donations/:id/complete-task
 * @access  Private/Volunteer
 */
const completeTask = asyncHandler(async (req, res) => {
  const donation = await Donation.findOne({ _id: req.params.id, assignedVolunteer: req.user.id });

  if (!donation) {
    return res.status(404).json({ success: false, message: 'Task not found or not assigned to you' });
  }

  donation.status = 'Completed';
  donation.completedAt = new Date();
  await donation.save();

  // Notify Citizen and NGO
  const { emitToUser } = require('../config/socket');
  emitToUser(donation.userId.toString(), 'donation:completed', { donationId: donation._id });
  if (donation.assignedNGO) {
    emitToUser(donation.assignedNGO.toString(), 'donation:completed', { donationId: donation._id });
  }

  res.json({
    success: true,
    message: 'Task marked as completed',
    data: { donation }
  });
});


/**
 * @desc    NGO cancels acceptance
 * @route   POST /api/donations/:id/cancel-acceptance
 * @access  Private/NGO
 */
const cancelAcceptance = asyncHandler(async (req, res) => {
  let donation = await Donation.findOne({ _id: req.params.id, assignedNGO: req.user.id });

  if (!donation) {
    return res.status(404).json({ success: false, message: 'Donation not found or not assigned to you' });
  }

  if (donation.status === 'Completed') {
    return res.status(400).json({ success: false, message: 'Cannot cancel a completed donation' });
  }

  donation.assignedNGO = null;
  donation.volunteerDetails = undefined;
  donation.status = 'Pending';
  donation.acceptedAt = undefined;
  
  await donation.save();

  res.json({
    success: true,
    message: 'Donation acceptance cancelled',
    data: { donation }
  });
});

/**
 * @desc    Update donation status
 * @route   PATCH /api/donations/:id/status
 * @access  Private/NGO/Admin
 */
const updateDonationStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  
  let donation = await Donation.findById(req.params.id);

  if (!donation) {
    return res.status(404).json({ success: false, message: 'Donation not found' });
  }

  if (req.user.role === 'ngo' && donation.assignedNGO?.toString() !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Not assigned to this donation' });
  }

  const updateData = { status };
  if (notes) updateData.notes = notes;
  if (status === 'Completed') {
    updateData.completedAt = new Date();
  } else if (status) {
    updateData.completedAt = undefined;
  }

  donation = await Donation.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  });

  res.json({
    success: true,
    message: `Donation status updated to ${status}`,
    data: { donation }
  });
});

/**
 * @desc    Delete donation
 * @route   DELETE /api/donations/:id
 * @access  Private/Owner/Admin
 */
const deleteDonation = asyncHandler(async (req, res) => {
  const donation = await Donation.findById(req.params.id);

  if (!donation) {
    return res.status(404).json({ success: false, message: 'Donation not found' });
  }

  if (donation.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized to delete this donation' });
  }

  if (donation.status !== 'Pending' && req.user.role !== 'admin') {
    return res.status(400).json({ success: false, message: 'Can only delete pending donations' });
  }

  await donation.deleteOne();

  res.json({
    success: true,
    message: 'Donation deleted successfully'
  });
});

/**
 * @desc    Admin deletes donation and sets feedback
 * @route   PATCH /api/donations/:id/admin
 * @access  Private/Admin
 */
const adminDeleteWithFeedback = asyncHandler(async (req, res) => {
  const { feedback } = req.body;
  const donation = await Donation.findById(req.params.id);

  if (!donation) {
    return res.status(404).json({ success: false, message: 'Donation not found' });
  }

  // Instead of completely deleting, we might want to mark it as Rejected with feedback
  // or truly delete if the prompt wants pure delete. "admin drops the request and sends a message"
  // Let's set status to Rejected and keep it so citizen sees feedback.
  donation.status = 'Rejected';
  donation.adminFeedback = feedback;
  donation.flagged = false;
  donation.flaggedAt = undefined;
  await donation.save();

  res.json({
    success: true,
    message: 'Donation rejected with feedback successfully',
    data: { donation }
  });
});


module.exports = {
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
};
