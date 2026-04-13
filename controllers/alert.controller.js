/**
 * Alert Controller
 * Handles alert management operations
 */

const Alert = require('../models/Alert');
const alertService = require('../services/alert.service');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @desc    Get all alerts
 * @route   GET /api/alerts
 * @access  Public
 */
const getAlerts = asyncHandler(async (req, res) => {
  const { status, severity, type, city, disaster: disasterId, sentByAdmin, page = 1, limit = 20 } = req.query;

  // Build query
  const query = {};
  if (status) query.status = status;
  if (severity) query.severity = severity;
  if (type) query.type = type;
  if (city) query['targetLocation.city'] = city;
  if (disasterId) query.disaster = disasterId;
  if (sentByAdmin === 'true') {
    query.$or = [
      { sentToAll: true },
      { sentToUsers: { $exists: true, $ne: [] } },
      { liveSource: true }
    ];
  }

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const alerts = await Alert.find(query)
    .populate('issuedBy', 'name email')
    .populate('disaster', 'name type')
    .populate('sentToUsers', 'name email role')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ 'timeline.issuedAt': -1 });

  const total = await Alert.countDocuments(query);

  res.json({
    success: true,
    data: {
      alerts,
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
 * @desc    Get active alerts
 * @route   GET /api/alerts/active
 * @access  Public
 */
const getActiveAlerts = asyncHandler(async (req, res) => {
  const alerts = await Alert.getActive()
    .populate('issuedBy', 'name')
    .populate('disaster', 'name type');

  res.json({
    success: true,
    data: { alerts }
  });
});

/**
 * @desc    Get critical alerts
 * @route   GET /api/alerts/critical
 * @access  Public
 */
const getCriticalAlerts = asyncHandler(async (req, res) => {
  const alerts = await Alert.getCritical()
    .populate('issuedBy', 'name');

  res.json({
    success: true,
    data: { alerts }
  });
});

/**
 * @desc    Get single alert
 * @route   GET /api/alerts/:id
 * @access  Public
 */
const getAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id)
    .populate('issuedBy', 'name email phone')
    .populate('disaster', 'name type status')
    .populate('acknowledgment.acknowledgedBy', 'name')
    .populate('updates.updatedBy', 'name');

  if (!alert) {
    return res.status(404).json({
      success: false,
      message: 'Alert not found'
    });
  }

  // Increment views
  alert.statistics.views += 1;
  await alert.save();

  res.json({
    success: true,
    data: { alert }
  });
});

/**
 * @desc    Create new alert
 * @route   POST /api/alerts
 * @access  Private/Admin
 */
const createAlert = asyncHandler(async (req, res) => {
  const alert = await alertService.createManualAlert(req.body, req.user.id);

  res.status(201).json({
    success: true,
    message: 'Alert created successfully',
    data: { alert }
  });
});

/**
 * @desc    Update alert
 * @route   PUT /api/alerts/:id
 * @access  Private/Admin
 */
const updateAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  if (!alert) {
    return res.status(404).json({
      success: false,
      message: 'Alert not found'
    });
  }

  res.json({
    success: true,
    message: 'Alert updated successfully',
    data: { alert }
  });
});

/**
 * @desc    Acknowledge alert
 * @route   PUT /api/alerts/:id/acknowledge
 * @access  Private/Admin
 */
const acknowledgeAlert = asyncHandler(async (req, res) => {
  const { notes, actions } = req.body;

  const alert = await Alert.findById(req.params.id);

  if (!alert) {
    return res.status(404).json({
      success: false,
      message: 'Alert not found'
    });
  }

  await alert.acknowledge(req.user.id, notes, actions);

  res.json({
    success: true,
    message: 'Alert acknowledged successfully',
    data: { alert }
  });
});

/**
 * @desc    Resolve alert
 * @route   PUT /api/alerts/:id/resolve
 * @access  Private/Admin
 */
const resolveAlert = asyncHandler(async (req, res) => {
  const alert = await Alert.findById(req.params.id);

  if (!alert) {
    return res.status(404).json({
      success: false,
      message: 'Alert not found'
    });
  }

  await alert.resolve();

  res.json({
    success: true,
    message: 'Alert resolved successfully',
    data: { alert }
  });
});

/**
 * @desc    Cancel alert
 * @route   PUT /api/alerts/:id/cancel
 * @access  Private/Admin
 */
const cancelAlert = asyncHandler(async (req, res) => {
  const { reason, notes } = req.body;

  const alert = await alertService.cancelAlert(
    req.params.id,
    reason,
    notes,
    req.user.id
  );

  res.json({
    success: true,
    message: 'Alert cancelled successfully',
    data: { alert }
  });
});

/**
 * @desc    Get alerts for current user
 * @route   GET /api/alerts/my-alerts
 * @access  Private
 */
const getMyAlerts = asyncHandler(async (req, res) => {
  const alerts = await alertService.getActiveAlertsForUser(req.user.id);

  res.json({
    success: true,
    data: { alerts }
  });
});

/**
 * @desc    Get unread alert count
 * @route   GET /api/alerts/unread-count
 * @access  Private
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await alertService.getUnreadAlertCount(req.user.id);

  res.json({
    success: true,
    data: { count }
  });
});

/**
 * @desc    Mark an alert as read for current user
 * @route   PATCH /api/alerts/:id/read
 * @access  Private
 */
const markAlertRead = asyncHandler(async (req, res) => {
  const alert = await alertService.markAlertAsRead(req.params.id, req.user.id);

  res.json({
    success: true,
    message: 'Alert marked as read',
    data: { alert }
  });
});

/**
 * @desc    Get alerts by city
 * @route   GET /api/alerts/city/:city
 * @access  Public
 */
const getAlertsByCity = asyncHandler(async (req, res) => {
  const { city } = req.params;

  const alerts = await Alert.getByCity(city);

  res.json({
    success: true,
    data: { alerts }
  });
});

/**
 * @desc    Get alert statistics
 * @route   GET /api/alerts/statistics/overview
 * @access  Private/Admin
 */
const getStatistics = asyncHandler(async (req, res) => {
  const stats = await alertService.getAlertStatistics();

  res.json({
    success: true,
    data: stats
  });
});

/**
 * @desc    Process predictions and generate alerts
 * @route   POST /api/alerts/process-predictions
 * @access  Private/Admin
 */
const processPredictions = asyncHandler(async (req, res) => {
  const alerts = await alertService.processPredictions();

  res.json({
    success: true,
    message: `Generated ${alerts?.length || 0} alerts from predictions`,
    data: { alerts }
  });
});

/**
 * @desc    Remove duplicate alerts created by the current admin
 * @route   POST /api/alerts/cleanup-duplicates
 * @access  Private/Admin
 */
const cleanupDuplicates = asyncHandler(async (req, res) => {
  const result = await alertService.cleanupDuplicateAlerts(req.user.id, {
    windowHours: req.body?.windowHours
  });

  res.json({
    success: true,
    message: result.removedCount > 0
      ? `Removed ${result.removedCount} duplicate alerts`
      : 'No duplicate alerts found',
    data: result
  });
});

/**
 * @desc    Delete alert
 * @route   DELETE /api/alerts/:id
 * @access  Private/Admin
 */
const deleteAlert = asyncHandler(async (req, res) => {
  const existingAlert = await Alert.findById(req.params.id).select('_id');
  if (!existingAlert) {
    return res.status(404).json({
      success: false,
      message: 'Alert not found'
    });
  }

  const result = await alertService.deleteAlertById(req.params.id);

  res.json({
    success: true,
    message: 'Alert deleted successfully',
    data: result
  });
});

// controllers/alertController.js

exports.createAlert = async (req, res) => {
  try {
    // ✅ Inject logged-in user
    req.body.issuedBy = req.user.id;

    const alert = await Alert.create(req.body);

    res.status(201).json({
      success: true,
      data: alert
    });

  } catch (error) {
    console.error('Create Alert Error:', error);

    res.status(400).json({
      success: false,
      message: error.message,
      errors: error.errors
    });
  }
};

module.exports = {
  getAlerts,
  getActiveAlerts,
  getCriticalAlerts,
  getAlert,
  createAlert,
  updateAlert,
  acknowledgeAlert,
  resolveAlert,
  cancelAlert,
  getMyAlerts,
  getUnreadCount,
  markAlertRead,
  getAlertsByCity,
  getStatistics,
  processPredictions,
  cleanupDuplicates,
  deleteAlert
};
