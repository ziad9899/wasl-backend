const notificationService = require('../services/notification.service');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const getNotifications = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const result = await notificationService.getUserNotifications(req.user._id, page, limit);
  return success(res, { notifications: result.notifications }, 'success', 200, result.pagination);
});

const markRead = asyncHandler(async (req, res) => {
  await notificationService.markAsRead(req.user._id, req.params.id);
  return success(res, {}, 'Marked as read');
});

const markAllRead = asyncHandler(async (req, res) => {
  await notificationService.markAllAsRead(req.user._id);
  return success(res, {}, 'All marked as read');
});

const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user._id);
  return success(res, { count });
});

module.exports = { getNotifications, markRead, markAllRead, getUnreadCount };
