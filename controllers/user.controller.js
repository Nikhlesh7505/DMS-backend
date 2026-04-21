/**
 * User Controller
 * Handles user management operations
 */

const User = require('../models/User');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @desc    Get all users
 * @route   GET /api/users
 * @access  Private/Admin
 */
const getUsers = asyncHandler(async (req, res) => {
  const { role, status, city, search, page = 1, limit = 20 } = req.query;

  // Build query
  const query = {};

  if (role) query.role = role;
  if (status) query.approvalStatus = status;
  if (city) query['location.city'] = city;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const users = await User.find(query)
    .select('-password')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ createdAt: -1 });

  const total = await User.countDocuments(query);

  res.json({
    success: true,
    data: {
      users,
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
 * @desc    Get current user's profile
 * @route   GET /api/users/profile
 * @access  Private
 */
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    data: { user }
  });
});

/**
 * @desc    Get volunteers by city or proximity
 * @route   GET /api/users/volunteers/nearby
 * @access  Private/NGO
 */
const getNearbyVolunteers = asyncHandler(async (req, res) => {
  const { city, lat, lng, radius = 50 } = req.query;

  const query = {
    role: 'volunteer',
    approvalStatus: 'approved',
    isActive: true
  };

  if (city) {
    query['location.city'] = { $regex: new RegExp(city, 'i') };
  }

  const volunteers = await User.find(query)
    .select('name phone email location availabilityStatus')
    .limit(50);

  res.json({
    success: true,
    data: { volunteers }
  });
});


/**
 * @desc    Get single user
 * @route   GET /api/users/:id
 * @access  Private
 */
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    data: { user }
  });
});

/**
 * @desc    Update user profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, location, emergencyContact, notifications, specialization } = req.body;

  const updateData = {};
  if (name) updateData.name = name;
  if (phone) updateData.phone = phone;
  if (location) updateData.location = location;
  if (emergencyContact) updateData.emergencyContact = emergencyContact;
  if (notifications) updateData.notifications = notifications;
  if (specialization) updateData.specialization = specialization;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    updateData,
    { new: true, runValidators: true }
  ).select('-password');

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: { user }
  });
});

/**
 * @desc    Update user organization
 * @route   PUT /api/users/organization
 * @access  Private/NGO/Rescue Team
 */
const updateOrganization = asyncHandler(async (req, res) => {
  const { organization } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { organization },
    { new: true, runValidators: true }
  ).select('-password');

  res.json({
    success: true,
    message: 'Organization updated successfully',
    data: { user }
  });
});

/**
 * @desc    Update user availability status
 * @route   PUT /api/users/availability
 * @access  Private/Rescue Team
 */
const updateAvailability = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    { availabilityStatus: status },
    { new: true }
  ).select('-password');

  res.json({
    success: true,
    message: 'Availability status updated',
    data: { user }
  });
});

/**
 * @desc    Approve or reject user (NGO/Rescue Team)
 * @route   PUT /api/users/:id/approve
 * @access  Private/Admin
 */
const approveUser = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  if (user.role === 'admin') {
    return res.status(400).json({
      success: false,
      message: 'Admin accounts do not require approval'
    });
  }

  user.approvalStatus = status;
  await user.save();

  // TODO: Send approval/rejection email

  res.json({
    success: true,
    message: `User ${status === 'approved' ? 'approved' : 'rejected'} successfully`,
    data: { user }
  });
});

/**
 * @desc    Deactivate user account
 * @route   PUT /api/users/:id/deactivate
 * @access  Private/Admin
 */
const deactivateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  user.isActive = false;
  await user.save();

  res.json({
    success: true,
    message: 'User deactivated successfully'
  });
});

/**
 * @desc    Get pending approvals (NGO/Rescue Teams)
 * @route   GET /api/users/pending-approvals
 * @access  Private/Admin
 */
const getPendingApprovals = asyncHandler(async (req, res) => {
  const users = await User.find({
    role: { $ne: 'admin' },
    approvalStatus: 'pending'
  }).select('-password').sort({ createdAt: -1 });

  res.json({
    success: true,
    data: { users }
  });
});

/**
 * @desc    Get users by role
 * @route   GET /api/users/by-role/:role
 * @access  Private/Admin
 */
const getUsersByRole = asyncHandler(async (req, res) => {
  const { role } = req.params;
  const { city } = req.query;

  const query = { role };
  if (city) query['location.city'] = city;

  const users = await User.find(query)
    .select('-password')
    .sort({ name: 1 });

  res.json({
    success: true,
    data: { users }
  });
});

/**
 * @desc    Get rescue teams by availability
 * @route   GET /api/users/rescue-teams/available
 * @access  Private
 */
const getAvailableRescueTeams = asyncHandler(async (req, res) => {
  const { city, specialization } = req.query;

  const query = {
    role: 'rescue_team',
    approvalStatus: 'approved',
    isActive: true,
    availabilityStatus: 'available'
  };

  if (city) query['location.city'] = city;
  if (specialization) query.specialization = specialization;

  const teams = await User.find(query).select('-password');

  res.json({
    success: true,
    data: { teams }
  });
});

/**
 * @desc    Delete user
 * @route   DELETE /api/users/:id
 * @access  Private/Admin
 */
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Prevent deleting own account
  if (user._id.toString() === req.user.id) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete your own account'
    });
  }

  await user.deleteOne();

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

module.exports = {
  getUsers,
  getProfile,
  getUser,
  updateProfile,
  updateOrganization,
  updateAvailability,
  approveUser,
  deactivateUser,
  getPendingApprovals,
  getUsersByRole,
  getAvailableRescueTeams,
  getNearbyVolunteers,
  deleteUser
};
