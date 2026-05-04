/**
 * Emergency Request Controller
 * Handles emergency request operations
 */

const EmergencyRequest = require('../models/EmergencyRequest');
const Notification = require('../models/Notification');
const Disaster = require('../models/Disaster');
const RescueTask = require('../models/RescueTask');
const User = require('../models/User');
const notificationService = require('../services/notification.service');
const { asyncHandler } = require('../middleware/error.middleware');

const CITIZEN_DELETABLE_STATUSES = new Set(['pending', 'cancelled']);
const RESPONDER_ROLES = new Set(['ngo', 'rescue_team']);

const isRequestOwner = (request, userId) => request?.citizen?.toString() === userId;
const isResponderOnly = (user) => RESPONDER_ROLES.has(user?.role);
const isAssignedToUser = (request, userId) =>
  request?.assignment?.assignedTo?.toString() === userId;
const isAssignedToAnotherResponder = (request, userId) =>
  request?.assignment?.assignedTo && !isAssignedToUser(request, userId);

const buildResponderVisibleRequestQuery = (userId, baseQuery = {}) => ({
  ...baseQuery,
  $or: [
    { status: 'pending', 'assignment.assignedTo': { $exists: false } },
    { status: 'pending', 'assignment.assignedTo': null },
    { 'assignment.assignedTo': userId }
  ]
});

const rejectIfAssignedToAnotherResponder = (request, req, res) => {
  if (isResponderOnly(req.user) && isAssignedToAnotherResponder(request, req.user.id)) {
    res.status(409).json({
      success: false,
      message: 'This request was already accepted by another responder.'
    });
    return true;
  }

  return false;
};

const claimForResponderIfNeeded = (request, req) => {
  if (!isResponderOnly(req.user) || request.assignment?.assignedTo) {
    return;
  }

  request.assignment.assignedTo = req.user.id;
  request.assignment.assignedAt = new Date();
  request.assignment.assignedBy = req.user.id;
  request.timeline.assignedAt = request.timeline.assignedAt || new Date();
};

const cleanupDeletedRequestReferences = async (requestId) => {
  const requestIdString = requestId.toString();

  await Promise.all([
    Notification.deleteMany({
      'source.module': 'emergency',
      'source.entityType': 'EmergencyRequest',
      'source.entityId': { $in: [requestId, requestIdString] }
    }),
    Disaster.updateMany(
      { emergencyRequests: requestId },
      { $pull: { emergencyRequests: requestId } }
    ),
    RescueTask.updateMany(
      { emergencyRequest: requestId },
      { $unset: { emergencyRequest: '' } }
    )
  ]);
};

const deleteRequestRecord = async (request) => {
  await cleanupDeletedRequestReferences(request._id);
  await request.deleteOne();
};

/**
 * @desc    Get all emergency requests
 * @route   GET /api/emergency
 * @access  Private/Admin/Responder
 */
const getRequests = asyncHandler(async (req, res) => {
  const { status, priority, type, city, page = 1, limit = 20 } = req.query;

  // Build query
  const query = {};
  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (type) query.type = type;
  if (city) query['location.city'] = city;
  const visibilityQuery = isResponderOnly(req.user)
    ? buildResponderVisibleRequestQuery(req.user.id, query)
    : query;

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const requests = await EmergencyRequest.find(visibilityQuery)
    .populate('citizen', 'name phone email')
    .populate('assignment.assignedTo', 'name phone organization')
    .populate('assignment.assignedBy', 'name')
    .populate('resolution.resolvedBy', 'name')
    .populate('disaster', 'name type')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ priority: -1, 'timeline.reportedAt': -1 });

  const total = await EmergencyRequest.countDocuments(visibilityQuery);

  res.json({
    success: true,
    data: {
      requests,
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
 * @desc    Get pending requests
 * @route   GET /api/emergency/pending
 * @access  Private/Admin/Responder
 */
const getPendingRequests = asyncHandler(async (req, res) => {
  const query = isResponderOnly(req.user)
    ? buildResponderVisibleRequestQuery(req.user.id, { status: 'pending' })
    : { status: { $in: ['pending', 'acknowledged'] } };

  const requests = await EmergencyRequest.find(query)
    .sort({ priority: -1, 'timeline.reportedAt': 1 })
    .populate('citizen', 'name phone email')
    .populate('assignment.assignedTo', 'name organization');

  res.json({
    success: true,
    data: { requests }
  });
});

/**
 * @desc    Get single request
 * @route   GET /api/emergency/:id
 * @access  Private
 */
const getRequest = asyncHandler(async (req, res) => {
  const request = await EmergencyRequest.findById(req.params.id)
    .populate('citizen', 'name phone email location')
    .populate('assignment.assignedTo', 'name phone organization')
    .populate('assignment.assignedBy', 'name')
    .populate('disaster', 'name type')
    .populate('updates.updatedBy', 'name')
    .populate('resolution.resolvedBy', 'name');

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  if (
    isResponderOnly(req.user) &&
    request.assignment?.assignedTo &&
    request.assignment.assignedTo._id.toString() !== req.user.id
  ) {
    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  res.json({
    success: true,
    data: { request }
  });
});

/**
 * @desc    Create emergency request
 * @route   POST /api/emergency
 * @access  Private
 */
const createRequest = asyncHandler(async (req, res) => {
  const alternativeContact = req.body.citizenInfo?.alternativeContact;

  const requestData = {
    ...req.body,
    type: req.body.type?.toLowerCase(), // Normalize type to lowercase
    citizen: req.user.id,
    citizenInfo: {
      name: req.user.name,
      phone: req.user.phone,
      email: req.user.email,
      ...(alternativeContact ? { alternativeContact } : {})
    }
  };

  const request = await EmergencyRequest.create(requestData);

  // Populate for response
  await request.populate('citizen', 'name phone email');
  await notificationService.notifyAdminsOfEmergencyRequest(request);

  res.status(201).json({
    success: true,
    message: 'Emergency request submitted successfully',
    data: { request }
  });
});

/**
 * @desc    Update request status
 * @route   PUT /api/emergency/:id/status
 * @access  Private/Admin/Responder
 */
const updateStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  const request = await EmergencyRequest.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  if (rejectIfAssignedToAnotherResponder(request, req, res)) {
    return;
  }

  claimForResponderIfNeeded(request, req);
  await request.updateStatus(status, note, req.user.id);
  await request.populate('citizen', 'name');
  await notificationService.notifyRequestStatusUpdate(request, {
    actorId: req.user.id,
    actorName: req.user.name,
    status,
    note
  });

  res.json({
    success: true,
    message: 'Status updated successfully',
    data: { request }
  });
});

/**
 * @desc    Acknowledge request
 * @route   PUT /api/emergency/:id/acknowledge
 * @access  Private/Admin/Responder
 */
const acknowledgeRequest = asyncHandler(async (req, res) => {
  const request = await EmergencyRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      status: 'pending',
      $or: [
        { 'assignment.assignedTo': { $exists: false } },
        { 'assignment.assignedTo': null }
      ]
    },
    {
      $set: {
        status: 'acknowledged',
        'assignment.assignedTo': req.user.id,
        'assignment.assignedAt': new Date(),
        'assignment.assignedBy': req.user.id,
        'timeline.acknowledgedAt': new Date(),
        'timeline.assignedAt': new Date(),
        'timeline.lastUpdatedAt': new Date()
      },
      $push: {
        updates: {
          status: 'acknowledged',
          note: 'Request acknowledged and accepted by responder',
          updatedBy: req.user.id,
          updatedAt: new Date()
        }
      }
    },
    { new: true }
  );

  if (!request) {
    const existingRequest = await EmergencyRequest.findById(req.params.id)
      .populate('assignment.assignedTo', 'name organization');

    if (
      existingRequest?.assignment?.assignedTo &&
      existingRequest.assignment.assignedTo._id.toString() !== req.user.id
    ) {
      return res.status(409).json({
        success: false,
        message: 'This request was already accepted by another responder.'
      });
    }

    if (existingRequest) {
      return res.status(200).json({
        success: true,
        message: `Request is already in ${existingRequest.status} status`,
        data: { request: existingRequest }
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  await request.populate([
    { path: 'citizen', select: 'name phone email' },
    { path: 'assignment.assignedTo', select: 'name phone organization' },
    { path: 'assignment.assignedBy', select: 'name' }
  ]);
  
  res.json({
    success: true,
    message: 'Request accepted successfully',
    data: { request }
  });
});

/**
 * @desc    Assign request to responder
 * @route   PUT /api/emergency/:id/assign
 * @access  Private/Admin/Responder
 */
const assignRequest = asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const assigneeId = isResponderOnly(req.user) ? req.user.id : userId;

  const request = await EmergencyRequest.findOneAndUpdate(
    {
      _id: req.params.id,
      status: { $in: ['pending', 'acknowledged'] },
      $or: [
        { 'assignment.assignedTo': { $exists: false } },
        { 'assignment.assignedTo': null },
        { 'assignment.assignedTo': assigneeId }
      ]
    },
    {
      $set: {
        status: 'assigned',
        'assignment.assignedTo': assigneeId,
        'assignment.assignedAt': new Date(),
        'assignment.assignedBy': req.user.id,
        'timeline.assignedAt': new Date(),
        'timeline.lastUpdatedAt': new Date()
      },
      $push: {
        updates: {
          status: 'assigned',
          note: 'Request assigned to responder',
          updatedBy: req.user.id,
          updatedAt: new Date()
        }
      }
    },
    { new: true }
  );

  if (!request) {
    const existingRequest = await EmergencyRequest.findById(req.params.id)
      .populate('assignment.assignedTo', 'name organization');

    if (
      existingRequest?.assignment?.assignedTo &&
      existingRequest.assignment.assignedTo._id.toString() !== assigneeId
    ) {
      return res.status(409).json({
        success: false,
        message: 'This request was already picked up by another responder.'
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  await request.populate([
    { path: 'citizen', select: 'name phone email' },
    { path: 'assignment.assignedTo', select: 'name organization' },
    { path: 'assignment.assignedBy', select: 'name' }
  ]);

  // Notify after population to ensure we have names if needed
  await notificationService.notifyRequestAssignment(request, {
    responderId: assigneeId,
    responderName: request.assignment?.assignedTo?.name,
    actorId: req.user.id,
    actorName: req.user.name
  });

  res.json({
    success: true,
    message: 'Request assigned successfully',
    data: { request }
  });
});

/**
 * @desc    Get my requests (for citizens)
 * @route   GET /api/emergency/my-requests
 * @access  Private
 */
const getMyRequests = asyncHandler(async (req, res) => {
  const requests = await EmergencyRequest.getByCitizen(req.user.id)
    .populate('assignment.assignedTo', 'name organization');

  res.json({
    success: true,
    data: { requests }
  });
});

/**
 * @desc    Get assigned requests (for responders)
 * @route   GET /api/emergency/assigned-to-me
 * @access  Private/Responder
 */
const getAssignedRequests = asyncHandler(async (req, res) => {
  const requests = await EmergencyRequest.getAssignedTo(req.user.id)
    .populate('citizen', 'name phone email')
    .populate('assignment.assignedTo', 'name organization')
    .populate('assignment.assignedBy', 'name')
    .populate('resolution.resolvedBy', 'name');

  res.json({
    success: true,
    data: { requests }
  });
});

/**
 * @desc    Resolve request
 * @route   PUT /api/emergency/:id/resolve
 * @access  Private/Admin/Responder
 */
const resolveRequest = asyncHandler(async (req, res) => {
  const { outcome, notes } = req.body;

  const request = await EmergencyRequest.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  if (rejectIfAssignedToAnotherResponder(request, req, res)) {
    return;
  }

  claimForResponderIfNeeded(request, req);
  await request.resolve(outcome, notes, req.user.id);
  
  await request.populate([
    { path: 'citizen', select: 'name phone email' },
    { path: 'assignment.assignedTo', select: 'name organization' },
    { path: 'resolution.resolvedBy', select: 'name' }
  ]);

  await notificationService.notifyRequestResolved(request, {
    actorId: req.user.id,
    actorName: req.user.name,
    outcome
  });

  res.json({
    success: true,
    message: 'Request resolved successfully',
    data: { request }
  });
});

/**
 * @desc    Add update to request
 * @route   POST /api/emergency/:id/updates
 * @access  Private/Admin/Responder
 */
const addUpdate = asyncHandler(async (req, res) => {
  const { note } = req.body;

  const request = await EmergencyRequest.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  if (rejectIfAssignedToAnotherResponder(request, req, res)) {
    return;
  }

  claimForResponderIfNeeded(request, req);
  request.updates.push({
    note,
    updatedBy: req.user.id,
    updatedAt: new Date()
  });

  await request.save();

  res.json({
    success: true,
    message: 'Update added successfully',
    data: { request }
  });
});

/**
 * @desc    Get request statistics
 * @route   GET /api/emergency/statistics/overview
 * @access  Private/Admin
 */
const getStatistics = asyncHandler(async (req, res) => {
  const stats = await EmergencyRequest.getStatistics();

  // Additional stats
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayRequests = await EmergencyRequest.countDocuments({
    'timeline.reportedAt': { $gte: today }
  });

  const avgResponseTime = await EmergencyRequest.aggregate([
    {
      $match: {
        status: 'resolved',
        'timeline.resolvedAt': { $exists: true },
        'timeline.reportedAt': { $exists: true }
      }
    },
    {
      $project: {
        responseTime: {
          $divide: [
            { $subtract: ['$timeline.resolvedAt', '$timeline.reportedAt'] },
            1000 * 60 // Convert to minutes
          ]
        }
      }
    },
    {
      $group: {
        _id: null,
        avgResponseTime: { $avg: '$responseTime' }
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      ...stats,
      todayRequests,
      avgResponseTime: Math.round(avgResponseTime[0]?.avgResponseTime || 0)
    }
  });
});

/**
 * @desc    Cancel request (by citizen)
 * @route   PUT /api/emergency/:id/cancel
 * @access  Private
 */
const cancelRequest = asyncHandler(async (req, res) => {
  const request = await EmergencyRequest.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  // Only allow cancellation by the citizen who created it
  if (request.citizen.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Not authorized to cancel this request'
    });
  }

  // Only allow cancellation if not already resolved
  if (request.status === 'resolved') {
    return res.status(400).json({
      success: false,
      message: 'Cannot cancel a resolved request'
    });
  }

  request.status = 'cancelled';
  request.timeline.cancelledAt = new Date();
  await request.save();
  await request.populate('citizen', 'name');
  await notificationService.notifyRequestStatusUpdate(request, {
    actorId: req.user.id,
    actorName: req.user.name,
    status: 'cancelled',
    note: 'Request cancelled'
  });

  res.json({
    success: true,
    message: 'Request cancelled successfully'
  });
});

/**
 * @desc    Delete request
 * @route   DELETE /api/emergency/:id
 * @access  Private/Admin/Citizen(Owner)
 */
const deleteRequest = asyncHandler(async (req, res) => {
  const request = await EmergencyRequest.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  // Authorization: Admin/Responder can delete, Citizen can only delete their own
  const isAdminOrResponder = ['admin', 'ngo', 'rescue_team'].includes(req.user.role);
  const isOwner = isRequestOwner(request, req.user.id);

  if (!isAdminOrResponder && !isOwner) {
    return res.status(403).json({
      success: false,
      message: 'You can only delete your own emergency requests'
    });
  }

  if (isAdminOrResponder && rejectIfAssignedToAnotherResponder(request, req, res)) {
    return;
  }

  // Business Logic: Citizens can only delete pending or cancelled requests
  if (!isAdminOrResponder && !CITIZEN_DELETABLE_STATUSES.has(request.status)) {
    return res.status(400).json({
      success: false,
      message: 'Only pending or cancelled requests can be deleted. Cancel the request first if you no longer need help.'
    });
  }

  await deleteRequestRecord(request);

  res.json({
    success: true,
    message: isAdminOrResponder 
      ? `Emergency request deleted successfully by ${req.user.role}` 
      : 'Your emergency request was deleted successfully'
  });
});

module.exports = {
  getRequests,
  getPendingRequests,
  getRequest,
  createRequest,
  updateStatus,
  acknowledgeRequest,
  assignRequest,
  getMyRequests,
  getAssignedRequests,
  resolveRequest,
  addUpdate,
  getStatistics,
  cancelRequest,
  deleteRequest
};
