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

const isRequestOwner = (request, userId) => request?.citizen?.toString() === userId;

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

  // Pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const requests = await EmergencyRequest.find(query)
    .populate('citizen', 'name phone email')
    .populate('assignment.assignedTo', 'name phone organization')
    .populate('assignment.assignedBy', 'name')
    .populate('resolution.resolvedBy', 'name')
    .populate('disaster', 'name type')
    .skip(skip)
    .limit(parseInt(limit))
    .sort({ priority: -1, 'timeline.reportedAt': -1 });

  const total = await EmergencyRequest.countDocuments(query);

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
  const requests = await EmergencyRequest.getPending()
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
  const request = await EmergencyRequest.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  // If already acknowledged or further along, just return success (idempotent)
  if (request.status !== 'pending') {
    return res.status(200).json({
      success: true,
      message: `Request is already in ${request.status} status`,
      data: { request }
    });
  }

  await request.updateStatus('acknowledged', 'Request acknowledged by responder', req.user.id);
  await request.populate([
    { path: 'citizen', select: 'name phone email' },
    { path: 'assignment.assignedTo', select: 'name organization' }
  ]);
  
  res.json({
    success: true,
    message: 'Request acknowledged successfully',
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

  const request = await EmergencyRequest.findById(req.params.id);

  if (!request) {
    return res.status(404).json({
      success: false,
      message: 'Emergency request not found'
    });
  }

  await request.assign(userId, req.user.id);

  await request.populate([
    { path: 'citizen', select: 'name phone email' },
    { path: 'assignment.assignedTo', select: 'name organization' },
    { path: 'assignment.assignedBy', select: 'name' }
  ]);

  // Notify after population to ensure we have names if needed
  await notificationService.notifyRequestAssignment(request, {
    responderId: userId,
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
