/**
 * Disaster Controller
 * Handles disaster management operations
 */

const Disaster = require('../models/Disaster');
const Alert = require('../models/Alert');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @desc    Get all disasters
 * @route   GET /api/disasters
 * @access  Public
 */
const getDisasters = asyncHandler(async (req, res) => {
  const { status, type, city, severity, page = 1, limit = 20 } = req.query;

  // Build query
  const query = {};
  if (status) query.status = status;
  if (type) query.type = type;
  if (city) query['location.city'] = city;
  if (severity) query.severity = severity;

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const disasters = await Disaster.find(query)
    .populate('response.incidentCommander', 'name email phone')
    .populate('response.responseTeams.team', 'name organization')
    .populate('alerts', 'title severity status')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ 'timeline.detectedAt': -1 });

  const total = await Disaster.countDocuments(query);

  res.json({
    success: true,
    data: {
      disasters,
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
 * @desc    Get active disasters
 * @route   GET /api/disasters/active
 * @access  Public
 */
const getActiveDisasters = asyncHandler(async (req, res) => {
  const disasters = await Disaster.getActive()
    .populate('response.incidentCommander', 'name email phone')
    .populate('alerts', 'title severity');

  res.json({
    success: true,
    data: { disasters }
  });
});

/**
 * @desc    Get single disaster
 * @route   GET /api/disasters/:id
 * @access  Public
 */
const getDisaster = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findById(req.params.id)
    .populate('response.incidentCommander', 'name email phone')
    .populate('response.responseTeams.team', 'name organization phone')
    .populate('response.resourcesDeployed.resource', 'name category')
    .populate('alerts')
    .populate('emergencyRequests')
    .populate('rescueTasks')
    .populate('updates.createdBy', 'name role')
    .populate('createdBy', 'name');

  if (!disaster) {
    return res.status(404).json({
      success: false,
      message: 'Disaster not found'
    });
  }

  res.json({
    success: true,
    data: { disaster }
  });
});

/**
 * @desc    Create new disaster
 * @route   POST /api/disasters
 * @access  Private/Admin
 */
const createDisaster = asyncHandler(async (req, res) => {
  const disasterData = {
    ...req.body,
    createdBy: req.user.id
  };

  const disaster = await Disaster.create(disasterData);

  res.status(201).json({
    success: true,
    message: 'Disaster created successfully',
    data: { disaster }
  });
});

/**
 * @desc    Update disaster
 * @route   PUT /api/disasters/:id
 * @access  Private/Admin
 */
const updateDisaster = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!disaster) {
    return res.status(404).json({
      success: false,
      message: 'Disaster not found'
    });
  }

  res.json({
    success: true,
    message: 'Disaster updated successfully',
    data: { disaster }
  });
});

/**
 * @desc    Update disaster status
 * @route   PUT /api/disasters/:id/status
 * @access  Private/Admin
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const disaster = await Disaster.findById(req.params.id);

  if (!disaster) {
    return res.status(404).json({
      success: false,
      message: 'Disaster not found'
    });
  }

  disaster.status = status;

  // Update timeline based on status
  if (status === 'active' && !disaster.timeline.startedAt) {
    disaster.timeline.startedAt = new Date();
  } else if (status === 'resolved') {
    disaster.timeline.endedAt = new Date();
  }

  await disaster.save();

  res.json({
    success: true,
    message: 'Disaster status updated',
    data: { disaster }
  });
});

/**
 * @desc    Add update to disaster
 * @route   POST /api/disasters/:id/updates
 * @access  Private/Admin/Responder
 */
const addUpdate = asyncHandler(async (req, res) => {
  const { content, type } = req.body;

  const disaster = await Disaster.findById(req.params.id);

  if (!disaster) {
    return res.status(404).json({
      success: false,
      message: 'Disaster not found'
    });
  }

  await disaster.addUpdate(content, type, req.user.id);

  res.json({
    success: true,
    message: 'Update added successfully',
    data: { disaster }
  });
});

/**
 * @desc    Assign response team to disaster
 * @route   POST /api/disasters/:id/assign-team
 * @access  Private/Admin
 */
const assignTeam = asyncHandler(async (req, res) => {
  const { teamId } = req.body;

  const disaster = await Disaster.findById(req.params.id);

  if (!disaster) {
    return res.status(404).json({
      success: false,
      message: 'Disaster not found'
    });
  }

  await disaster.assignTeam(teamId);

  res.json({
    success: true,
    message: 'Team assigned successfully',
    data: { disaster }
  });
});

/**
 * @desc    Get disaster statistics
 * @route   GET /api/disasters/statistics/overview
 * @access  Private/Admin
 */
const getStatistics = asyncHandler(async (req, res) => {
  const stats = await Disaster.getStatistics();

  // Additional statistics
  const activeDisasters = await Disaster.countDocuments({
    status: { $in: ['monitoring', 'active', 'contained'] }
  });

  const totalAffected = await Disaster.aggregate([
    { $group: { _id: null, total: { $sum: '$impact.affectedPopulation' } } }
  ]);

  const totalCasualties = await Disaster.aggregate([
    { $group: { _id: null, total: { $sum: '$impact.casualties.confirmed' } } }
  ]);

  res.json({
    success: true,
    data: {
      byType: stats,
      activeDisasters,
      totalAffected: totalAffected[0]?.total || 0,
      totalCasualties: totalCasualties[0]?.total || 0
    }
  });
});

/**
 * @desc    Get disasters by city
 * @route   GET /api/disasters/city/:city
 * @access  Public
 */
const getDisastersByCity = asyncHandler(async (req, res) => {
  const { city } = req.params;

  const disasters = await Disaster.getByCity(city);

  res.json({
    success: true,
    data: { disasters }
  });
});

/**
 * @desc    Delete disaster
 * @route   DELETE /api/disasters/:id
 * @access  Private/Admin
 */
const deleteDisaster = asyncHandler(async (req, res) => {
  const disaster = await Disaster.findById(req.params.id);

  if (!disaster) {
    return res.status(404).json({
      success: false,
      message: 'Disaster not found'
    });
  }

  await disaster.deleteOne();

  res.json({
    success: true,
    message: 'Disaster deleted successfully'
  });
});

module.exports = {
  getDisasters,
  getActiveDisasters,
  getDisaster,
  createDisaster,
  updateDisaster,
  updateStatus,
  addUpdate,
  assignTeam,
  getStatistics,
  getDisastersByCity,
  deleteDisaster
};
