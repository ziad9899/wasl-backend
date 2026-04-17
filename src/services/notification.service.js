const Notification = require('../models/Notification');
const { paginate } = require('../utils/response');

const getUserNotifications = async (userId, page = 1, limit = 20) => {
  const skip  = (page - 1) * limit;
  const total = await Notification.countDocuments({ userId });

  const notifications = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return {
    notifications,
    pagination: paginate(page, limit, total),
  };
};

const markAsRead = async (userId, notificationId) => {
  await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true, readAt: new Date() }
  );
};

const markAllAsRead = async (userId) => {
  await Notification.updateMany(
    { userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
};

const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ userId, isRead: false });
};

module.exports = {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
};