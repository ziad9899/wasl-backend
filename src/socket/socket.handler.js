const jwt      = require('jsonwebtoken');
const User     = require('../models/User');
const Provider = require('../models/Provider');
const Chat     = require('../models/Chat');
const Message  = require('../models/Message');
const Order    = require('../models/Order');
const logger   = require('../utils/logger');

const onlineUsers = new Map();

const authenticate = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token?.replace('Bearer ', '');
    if (!token) return next(new Error('Authentication required'));

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const user    = await User.findById(decoded.userId).select(
      'name phone role status avatar'
    );

    if (!user)                       return next(new Error('User not found'));
    if (user.status === 'suspended') return next(new Error('Account suspended'));

    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
};

const registerHandlers = (io, socket) => {
  const userId = socket.user._id.toString();

  onlineUsers.set(userId, socket.id);
  socket.join(`user:${userId}`);

  logger.info(`Socket connected: ${socket.id} | user: ${userId} | role: ${socket.user.role}`);

  socket.on('join:order', async (orderId) => {
    try {
      const order = await Order.findById(orderId).select('clientId providerId');
      if (!order) return;

      const isParticipant =
        order.clientId.toString()    === userId ||
        order.providerId?.toString() === userId ||
        socket.user.role             === 'admin';

      if (isParticipant) {
        socket.join(`order:${orderId}`);
        logger.info(`User ${userId} joined order room: ${orderId}`);
      }
    } catch (err) {
      logger.error('join:order error:', err.message);
    }
  });

  socket.on('leave:order', (orderId) => {
    socket.leave(`order:${orderId}`);
  });

  socket.on('join:chat', async (chatId) => {
    try {
      const chat = await Chat.findById(chatId).select('clientId providerId');
      if (!chat) return;

      const isParticipant =
        chat.clientId.toString()   === userId ||
        chat.providerId.toString() === userId ||
        socket.user.role           === 'admin';

      if (isParticipant) {
        socket.join(`chat:${chatId}`);
      }
    } catch (err) {
      logger.error('join:chat error:', err.message);
    }
  });

  socket.on('chat:send_message', async (data) => {
    try {
      const { chatId, type, content, location } = data;

      if (!chatId || (!content && type !== 'location')) return;

      const chat = await Chat.findById(chatId).select('clientId providerId isActive');
      if (!chat || !chat.isActive) return;

      const isParticipant =
        chat.clientId.toString()   === userId ||
        chat.providerId.toString() === userId;

      if (!isParticipant) return;

      const messageData = {
        chatId,
        senderId: socket.user._id,
        type:     type || 'text',
        content:  content || '',
      };

      if (type === 'location' && location) {
        messageData.location = {
          lat: location.lat,
          lng: location.lng,
        };
        messageData.content = 'location';
      }

      const message = await Message.create(messageData);

      const recipientId =
        chat.clientId.toString() === userId
          ? chat.providerId.toString()
          : chat.clientId.toString();

      await Chat.findByIdAndUpdate(chatId, {
        lastMessage:   content || (type === 'location' ? '📍 موقع' : ''),
        lastMessageAt: new Date(),
        $inc: { [`unreadCount.${recipientId}`]: 1 },
      });

      const populated = await Message.findById(message._id)
        .populate('senderId', 'name avatar')
        .lean();

      io.to(`chat:${chatId}`).emit('chat:new_message', { message: populated });

      const recipientSocketId = onlineUsers.get(recipientId);
      if (!recipientSocketId) {
        const { sendToUser } = require('../services/fcm.service');
        await sendToUser(recipientId, 'system', { chatId });
      }
    } catch (err) {
      logger.error('chat:send_message error:', err.message);
    }
  });

  socket.on('chat:typing', (data) => {
    const { chatId } = data;
    if (!chatId) return;
    socket.to(`chat:${chatId}`).emit('chat:typing', {
      userId,
      name: socket.user.name,
    });
  });

  socket.on('chat:stop_typing', (data) => {
    const { chatId } = data;
    if (!chatId) return;
    socket.to(`chat:${chatId}`).emit('chat:stop_typing', { userId });
  });

  socket.on('provider:update_location', async (data) => {
    try {
      if (socket.user.role !== 'provider') return;

      const { lat, lng, orderId } = data;
      if (!lat || !lng) return;

      await Provider.findOneAndUpdate(
        { userId: socket.user._id },
        {
          currentLocation: {
            type:        'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)],
          },
          locationUpdatedAt: new Date(),
        }
      );

      if (orderId) {
        socket.to(`order:${orderId}`).emit('provider:location_update', {
          orderId,
          lat,
          lng,
          providerId: userId,
        });
      }
    } catch (err) {
      logger.error('provider:update_location error:', err.message);
    }
  });

  socket.on('provider:set_online', async (data) => {
    try {
      if (socket.user.role !== 'provider') return;

      const { isOnline } = data;

      const provider = await Provider.findOne({ userId: socket.user._id })
        .select('approvalStatus');

      if (!provider || provider.approvalStatus !== 'approved') return;

      await Provider.findOneAndUpdate(
        { userId: socket.user._id },
        { isOnline: Boolean(isOnline) }
      );

      socket.emit('provider:status_confirmed', { isOnline: Boolean(isOnline) });
    } catch (err) {
      logger.error('provider:set_online error:', err.message);
    }
  });

  socket.on('order:create', async (data) => {
    try {
      socket.emit('order:creating', { status: 'processing' });
    } catch (err) {
      logger.error('order:create socket error:', err.message);
    }
  });

  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });

  socket.on('disconnect', async (reason) => {
    onlineUsers.delete(userId);
    logger.info(`Socket disconnected: ${socket.id} | reason: ${reason}`);

    if (socket.user.role === 'provider') {
      try {
        await Provider.findOneAndUpdate(
          { userId: socket.user._id },
          { isOnline: false }
        );
      } catch (err) {
        logger.error('disconnect provider offline error:', err.message);
      }
    }
  });

  socket.on('error', (err) => {
    logger.error(`Socket error for ${userId}:`, err.message);
  });
};

const initSocket = (io) => {
  io.use(authenticate);

  io.on('connection', (socket) => {
    registerHandlers(io, socket);
  });

  logger.info('Socket.IO initialized');
  return io;
};

const getOnlineUsers = () => onlineUsers;

module.exports = { initSocket, getOnlineUsers };