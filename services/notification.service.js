const Notification = require('../models/Notification');
const User = require('../models/User');
const { emitToUser, emitToRole } = require('../config/socket');

const priorityToSeverity = {
  low: 'info',
  medium: 'watch',
  high: 'warning',
  critical: 'danger',
  life_threatening: 'critical'
};

const createNotification = async ({
  userId,
  title,
  message,
  type = 'system',
  category = 'general',
  severity = 'info',
  actor = null,
  source = {},
  metadata = {},
  channels = ['in_app', 'dashboard'],
  expiresAt
}) => {
  const notification = await Notification.create({
    user: userId,
    title,
    message,
    type,
    category,
    severity,
    actor,
    source,
    metadata,
    channels,
    expiresAt
  });

  emitToUser(userId, 'notification:new', {
    _id: notification._id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    severity: notification.severity,
    createdAt: notification.createdAt
  });

  return notification;
};

const notifyUsers = async ({ userIds, ...payload }) => {
  const uniqueIds = [...new Set((userIds || []).filter(Boolean).map((id) => id.toString()))];
  if (uniqueIds.length === 0) {
    return [];
  }

  const notifications = [];
  for (const userId of uniqueIds) {
    notifications.push(await createNotification({ userId, ...payload }));
  }

  return notifications;
};

const notifyAlertRecipients = async (alert, users = []) => {
  const userIds = users.map((user) => user._id);
  return notifyUsers({
    userIds,
    title: alert.title,
    message: alert.message,
    type: 'alert',
    category: alert.disasterType || alert.type || 'alert',
    severity: alert.severity === 'emergency' ? 'critical' : alert.severity,
    source: {
      module: 'alerts',
      entityType: 'Alert',
      entityId: alert._id
    },
    metadata: {
      disasterType: alert.disasterType,
      targetLocation: alert.targetLocation,
      source: alert.source
    }
  });
};

const notifyAdminsOfEmergencyRequest = async (request) => {
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id');
  const userIds = admins.map((admin) => admin._id);

  emitToRole('admin', 'emergency:new', {
    requestId: request._id,
    type: request.type,
    city: request.location?.city,
    priority: request.priority
  });

  return notifyUsers({
    userIds,
    title: 'New emergency request received',
    message: `${request.type.replace(/_/g, ' ')} reported from ${request.location?.city || 'an unknown location'}.`,
    type: 'emergency',
    category: 'triage',
    severity: priorityToSeverity[request.priority] || 'warning',
    source: {
      module: 'emergency',
      entityType: 'EmergencyRequest',
      entityId: request._id
    },
    metadata: {
      priority: request.priority,
      city: request.location?.city
    }
  });
};

const notifyRequestAssignment = async (request, {
  responderId,
  responderName,
  actorId,
  actorName
}) => {
  const targetIds = [responderId, request.citizen].filter(Boolean);

  return notifyUsers({
    userIds: targetIds,
    title: 'Emergency request assigned',
    message: `Request in ${request.location?.city} has been assigned${responderName ? ` to ${responderName}` : ''}.`,
    type: 'task',
    category: 'assignment',
    severity: priorityToSeverity[request.priority] || 'warning',
    actor: actorId,
    source: {
      module: 'emergency',
      entityType: 'EmergencyRequest',
      entityId: request._id
    },
    metadata: {
      actorName,
      responderName,
      status: request.status
    }
  });
};

const notifyRequestStatusUpdate = async (request, {
  actorId,
  actorName,
  status,
  note
}) => {
  const userIds = [request.citizen, request.assignment?.assignedTo].filter(Boolean);
  return notifyUsers({
    userIds,
    title: 'Emergency request status updated',
    message: `Request status changed to ${status.replace(/_/g, ' ')}${note ? `: ${note}` : ''}.`,
    type: 'emergency',
    category: 'status',
    severity: priorityToSeverity[request.priority] || 'watch',
    actor: actorId,
    source: {
      module: 'emergency',
      entityType: 'EmergencyRequest',
      entityId: request._id
    },
    metadata: {
      actorName,
      status
    }
  });
};

const notifyRequestResolved = async (request, {
  actorId,
  actorName,
  outcome
}) => {
  const userIds = [request.citizen, request.assignment?.assignedTo].filter(Boolean);
  return notifyUsers({
    userIds,
    title: 'Emergency request resolved',
    message: `Request closed with outcome: ${outcome || 'successful'}.`,
    type: 'emergency',
    category: 'resolution',
    severity: 'info',
    actor: actorId,
    source: {
      module: 'emergency',
      entityType: 'EmergencyRequest',
      entityId: request._id
    },
    metadata: {
      actorName,
      outcome
    }
  });
};

const getUserNotifications = async (userId, { limit = 20, unreadOnly = false } = {}) => {
  return Notification.getForUser(userId, { limit, unreadOnly });
};

const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ user: userId, read: false });
};

const markNotificationRead = async (notificationId, userId) => {
  const notification = await Notification.findOne({ _id: notificationId, user: userId });
  if (!notification) {
    return null;
  }

  return notification.markAsRead();
};

const markAllNotificationsRead = async (userId) => {
  await Notification.updateMany(
    { user: userId, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
};

module.exports = {
  createNotification,
  notifyUsers,
  notifyAlertRecipients,
  notifyAdminsOfEmergencyRequest,
  notifyRequestAssignment,
  notifyRequestStatusUpdate,
  notifyRequestResolved,
  getUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead
};
