const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Order = require('../models/Order');
const { success, paginate } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../errors');

const getOrCreateChat = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');

  const isClient = order.clientId.toString() === req.user._id.toString();
  const isProvider = order.providerId?.toString() === req.user._id.toString();
  if (!isClient && !isProvider && req.user.role !== 'admin') throw new ForbiddenError('Access denied');

  let chat = await Chat.findOne({ orderId });
  if (!chat) {
    if (!order.providerId) throw new BadRequestError('Order has no provider yet');
    chat = await Chat.create({
      orderId,
      clientId: order.clientId,
      providerId: order.providerId,
      unreadCount: {
        [order.clientId.toString()]: 0,
        [order.providerId.toString()]: 0,
      },
    });
    await Order.findByIdAndUpdate(orderId, { chatRoomId: chat._id });
  }

  return success(res, { chat });
});

const getConversations = asyncHandler(async (req, res) => {
  const userId = req.user._id.toString();
  const filter = req.user.role === 'client'
    ? { clientId: req.user._id }
    : { providerId: req.user._id };

  const chats = await Chat.find({ ...filter, isActive: true })
    .populate('orderId', 'orderNumber serviceCategory status')
    .populate('clientId', 'name avatar')
    .populate('providerId', 'name avatar')
    .sort({ lastMessageAt: -1 })
    .lean();

  const result = chats.map((c) => ({
    ...c,
    myUnread: c.unreadCount?.[userId] || 0,
  }));

  return success(res, { conversations: result });
});

const getMessages = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const skip = (page - 1) * limit;

  const chat = await Chat.findById(chatId);
  if (!chat) throw new NotFoundError('Chat');

  const isParticipant =
    chat.clientId.toString() === req.user._id.toString() ||
    chat.providerId.toString() === req.user._id.toString() ||
    req.user.role === 'admin';

  if (!isParticipant) throw new ForbiddenError('Access denied');

  const [messages, total] = await Promise.all([
    Message.find({ chatId })
      .populate('senderId', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Message.countDocuments({ chatId }),
  ]);

  await Message.updateMany(
    { chatId, senderId: { $ne: req.user._id }, isRead: false },
    { isRead: true, readAt: new Date() }
  );

  await Chat.findByIdAndUpdate(chatId, {
    $set: { [`unreadCount.${req.user._id}`]: 0 },
  });

  return success(res, { messages: messages.reverse() }, 'success', 200, paginate(page, limit, total));
});

const sendMessage = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  const { type, content } = req.body;

  const chat = await Chat.findById(chatId);
  if (!chat) throw new NotFoundError('Chat');
  if (!chat.isActive) throw new BadRequestError('Chat is closed');

  const isParticipant =
    chat.clientId.toString() === req.user._id.toString() ||
    chat.providerId.toString() === req.user._id.toString();
  if (!isParticipant) throw new ForbiddenError('Access denied');

  const message = await Message.create({
    chatId,
    senderId: req.user._id,
    type: type || 'text',
    content: content || '',
  });

  const recipientId = chat.clientId.toString() === req.user._id.toString()
    ? chat.providerId.toString()
    : chat.clientId.toString();

  await Chat.findByIdAndUpdate(chatId, {
    lastMessage: content || '',
    lastMessageType: type || 'text',
    lastMessageAt: new Date(),
    $inc: { [`unreadCount.${recipientId}`]: 1 },
  });

  const populated = await message.populate('senderId', 'name avatar');
  return success(res, { message: populated }, 'Message sent', 201);
});

const sendMediaMessage = asyncHandler(async (req, res) => {
  const { chatId } = req.params;
  if (!req.file) throw new BadRequestError('No file uploaded');

  const chat = await Chat.findById(chatId);
  if (!chat) throw new NotFoundError('Chat');
  if (!chat.isActive) throw new BadRequestError('Chat is closed');

  const isParticipant =
    chat.clientId.toString() === req.user._id.toString() ||
    chat.providerId.toString() === req.user._id.toString();
  if (!isParticipant) throw new ForbiddenError('Access denied');

  const message = await Message.create({
    chatId,
    senderId: req.user._id,
    type: 'image',
    content: '',
    mediaUrl: req.file.path,
  });

  const recipientId = chat.clientId.toString() === req.user._id.toString()
    ? chat.providerId.toString()
    : chat.clientId.toString();

  await Chat.findByIdAndUpdate(chatId, {
    lastMessage: 'image',
    lastMessageType: 'image',
    lastMessageAt: new Date(),
    $inc: { [`unreadCount.${recipientId}`]: 1 },
  });

  const populated = await message.populate('senderId', 'name avatar');
  return success(res, { message: populated }, 'Media sent', 201);
});

module.exports = {
  getOrCreateChat,
  getConversations,
  getMessages,
  sendMessage,
  sendMediaMessage,
};
