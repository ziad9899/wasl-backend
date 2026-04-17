const mongoose = require('mongoose');
const Bid = require('../models/Bid');
const Order = require('../models/Order');
const Provider = require('../models/Provider');
const Config = require('../models/Config');
const fcmService = require('../services/fcm.service');
const fraudService = require('../services/fraud.service');
const { calculateCommission } = require('../utils/money');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const {
  ORDER_STATUS,
  NOTIFICATION_TYPES,
  PROVIDER_APPROVAL,
  CONFIG_KEYS,
} = require('../constants');
const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  RateLimitError,
} = require('../errors');

let _io = null;
const setIo = (io) => { _io = io; };

const submitBid = asyncHandler(async (req, res) => {
  const { orderId, price, note, arrivalTime } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');
  if (order.pricingType !== 'bid') throw new BadRequestError('This order does not accept bids');
  if (order.status !== ORDER_STATUS.BROADCASTING) throw new BadRequestError('Order is no longer accepting bids');

  const provider = await Provider.findOne({ userId: req.user._id });
  if (!provider || provider.approvalStatus !== PROVIDER_APPROVAL.APPROVED) {
    throw new ForbiddenError('Provider not approved');
  }

  const velocityCheck = await fraudService.checkBidVelocity(req.user._id);
  if (velocityCheck.blocked) throw new RateLimitError(velocityCheck.reason);

  const existing = await Bid.findOne({ orderId, providerId: req.user._id });
  if (existing) throw new ConflictError('You already submitted a bid for this order');

  const maxBids = (await Config.get(CONFIG_KEYS.MAX_BIDS_PER_ORDER)) || 10;
  const currentBidsCount = await Bid.countDocuments({ orderId, status: 'pending' });
  if (currentBidsCount >= maxBids) throw new ConflictError('Maximum bids reached for this order');

  const bidExpiryMinutes = (await Config.get(CONFIG_KEYS.BID_EXPIRY_MINUTES)) || 10;

  const bid = await Bid.create({
    orderId,
    providerId: req.user._id,
    price: Math.round(Number(price)),
    note: note || '',
    arrivalTime: arrivalTime || null,
    expiresAt: new Date(Date.now() + bidExpiryMinutes * 60 * 1000),
  });

  if (_io) {
    _io.to(`user:${order.clientId}`).emit('bid:new', {
      orderId,
      bid: {
        _id: bid._id,
        providerId: req.user._id,
        price: bid.price,
        note: bid.note,
        arrivalTime: bid.arrivalTime,
        provider: {
          name: req.user.name,
          avatar: req.user.avatar,
          rating: req.user.rating,
        },
      },
    });
  }

  await fcmService.sendToUser(order.clientId, NOTIFICATION_TYPES.BID_NEW, {
    orderId: orderId.toString(),
    bidId: bid._id.toString(),
  });

  return success(res, { bid }, 'Bid submitted', 201);
});

const getOrderBids = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');

  if (order.clientId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new ForbiddenError('Access denied');
  }

  const sort = req.query.sort === 'rating' ? { price: 1 } : { price: 1 };

  const bids = await Bid.find({ orderId, status: 'pending' })
    .populate('providerId', 'name phone avatar rating')
    .sort(sort)
    .lean();

  return success(res, { bids });
});

const acceptBid = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const bid = await Bid.findById(req.params.id).session(session).populate('orderId');
    if (!bid) throw new NotFoundError('Bid');
    if (bid.status !== 'pending') throw new ConflictError('Bid is no longer available');

    const order = bid.orderId;
    if (order.clientId.toString() !== req.user._id.toString()) throw new ForbiddenError('Access denied');

    if (![ORDER_STATUS.BROADCASTING, ORDER_STATUS.PENDING].includes(order.status)) {
      throw new ConflictError('Order is no longer available');
    }

    await Bid.findByIdAndUpdate(req.params.id, { status: 'accepted' }, { session });

    await Bid.updateMany(
      { orderId: order._id, _id: { $ne: req.params.id }, status: 'pending' },
      { status: 'rejected' },
      { session }
    );

    const config = await Config.getAll();
    const commissionRatePct = config.commissionRate || 10;
    const commissionAmount = calculateCommission(bid.price, commissionRatePct);
    const totalPrice = bid.price;

    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      {
        status: ORDER_STATUS.ACCEPTED,
        providerId: bid.providerId,
        agreedPrice: bid.price,
        subtotal: bid.price,
        totalPrice,
        commission: { rate: commissionRatePct / 100, amount: commissionAmount },
        providerPayout: Math.max(0, totalPrice - commissionAmount),
        $push: {
          timeline: {
            status: ORDER_STATUS.ACCEPTED,
            note: 'Client accepted bid',
            actorId: req.user._id,
            actorRole: 'client',
            timestamp: new Date(),
          },
        },
      },
      { new: true, session }
    );

    await session.commitTransaction();

    if (_io) {
      _io.to(`user:${bid.providerId}`).emit('bid:accepted', {
        orderId: order._id,
        bidId: bid._id,
        agreedPrice: bid.price,
      });
      _io.to(`order:${order._id}`).emit('order:accepted', {
        orderId: order._id,
        providerId: bid.providerId,
      });
    }

    await fcmService.sendToUser(bid.providerId.toString(), NOTIFICATION_TYPES.BID_ACCEPTED, {
      orderId: order._id.toString(),
      bidId: bid._id.toString(),
    });

    const rejected = await Bid.find({ orderId: order._id, status: 'rejected' }).select('providerId');
    for (const r of rejected) {
      await fcmService.sendToUser(r.providerId.toString(), NOTIFICATION_TYPES.BID_REJECTED, {
        orderId: order._id.toString(),
      });
    }

    return success(res, { order: updatedOrder }, 'Bid accepted');
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});

const rejectBid = asyncHandler(async (req, res) => {
  const bid = await Bid.findById(req.params.id);
  if (!bid) throw new NotFoundError('Bid');
  if (bid.status !== 'pending') throw new BadRequestError('Bid already processed');

  const order = await Order.findById(bid.orderId);
  if (order.clientId.toString() !== req.user._id.toString()) throw new ForbiddenError('Access denied');

  await Bid.findByIdAndUpdate(req.params.id, { status: 'rejected' });

  await fcmService.sendToUser(bid.providerId.toString(), NOTIFICATION_TYPES.BID_REJECTED, {
    orderId: order._id.toString(),
  });

  return success(res, {}, 'Bid rejected');
});

module.exports = { setIo, submitBid, getOrderBids, acceptBid, rejectBid };
