const notificationService = require('../services/notification.service');
const { asyncHandler } = require('../middleware/error.middleware');

const getMyNotifications = asyncHandler(async (req, res) => {
  const { limit = 20, unreadOnly = 'false' } = req.query;
  const notifications = await notificationService.getUserNotifications(req.user.id, {
    limit: parseInt(limit, 10),
    unreadOnly: unreadOnly === 'true'
  });

  res.json({
    success: true,
    data: { notifications }
  });
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id);

  res.json({
    success: true,
    data: { count }
  });
});

const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markNotificationRead(req.params.id, req.user.id);

  if (!notification) {
    return res.status(404).json({
      success: false,
      message: 'Notification not found'
    });
  }

  res.json({
    success: true,
    message: 'Notification marked as read',
    data: { notification }
  });
});

const markAllAsRead = asyncHandler(async (req, res) => {
  await notificationService.markAllNotificationsRead(req.user.id);

  res.json({
    success: true,
    message: 'All notifications marked as read'
  });
});

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
