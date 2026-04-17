const Order = require('../models/Order');
const Provider = require('../models/Provider');
const Config = require('../models/Config');
const Coupon = require('../models/Coupon');
const CarWashPrice = require('../models/CarWashPrice');
const fcmService = require('../services/fcm.service');
const ledgerService = require('../services/ledger.service');
const referralService = require('../services/referral.service');
const maskedPhoneService = require('../services/masked-phone.service');
const auditService = require('../services/audit.service');
const { broadcast, findNearbyProviders, cancelTimeout } = require('../services/broadcasting.service');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { calculateCommission } = require('../utils/money');
const {
  ORDER_STATUS,
  FIXED_PRICE_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_STATUS,
  NOTIFICATION_TYPES,
  CONFIG_KEYS,
  USER_ROLES,
  PROVIDER_APPROVAL,
} = require('../constants');
const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  ServiceUnavailableError,
} = require('../errors');

let _io = null;
const setIo = (io) => { _io = io; };

const isWithinWorkingHours = (workingHours) => {
  const hours = workingHours || { start: '06:00', end: '23:00' };
  const now = new Date();
  const offsetHours = 3;
  const hour = (now.getUTCHours() + offsetHours) % 24;
  const [startH] = hours.start.split(':').map(Number);
  const [endH] = hours.end.split(':').map(Number);
  return hour >= startH && hour < endH;
};

const resolveCoupon = async (code, userId, amountHalalas) => {
  if (!code) return { coupon: null, discount: 0 };
  const now = new Date();
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) throw new BadRequestError('Invalid or expired coupon');

  if (coupon.expiresAt && coupon.expiresAt <= now) throw new BadRequestError('Coupon expired');
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    throw new BadRequestError('Coupon usage limit reached');
  }
  if (coupon.usedBy.some((u) => u.toString() === userId.toString())) {
    throw new BadRequestError('Coupon already used');
  }
  if (amountHalalas < coupon.minOrderValue) {
    throw new BadRequestError(`Minimum order value for this coupon is ${coupon.minOrderValue / 100} SAR`);
  }

  let discount = 0;
  if (coupon.discountType === 'percentage') {
    discount = Math.round((amountHalalas * coupon.discountValue) / 100);
    if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  } else {
    discount = coupon.discountValue;
  }
  return { coupon, discount };
};

const resolveCarWashPrice = async (item) => {
  if (!item.vehicleSize || !item.washType) return 0;
  const price = await CarWashPrice.findOne({
    vehicleSize: item.vehicleSize,
    washType: item.washType,
    isActive: true,
  });
  if (!price) throw new BadRequestError('Car wash price not configured');
  return price.price;
};

const createOrder = asyncHandler(async (req, res) => {
  const {
    items,
    serviceCategory,
    serviceDetails,
    lat,
    lng,
    address,
    paymentMethod,
    couponCode,
    notes,
  } = req.body;

  const config = await Config.getAll();

  if (config.maintenanceMode) throw new ServiceUnavailableError('Maintenance mode is active');

  if (!isWithinWorkingHours(config.workingHours)) {
    const hours = config.workingHours || { start: '06:00', end: '23:00' };
    throw new ServiceUnavailableError(
      `Service available from ${hours.start} to ${hours.end}`
    );
  }

  const category = serviceCategory || items?.[0]?.serviceCategory;
  if (!category) throw new BadRequestError('serviceCategory is required');

  const isFixed = FIXED_PRICE_CATEGORIES.includes(category);
  const pricingType = isFixed ? 'fixed' : 'bid';

  let subtotal = 0;
  let normalizedItems = [];

  if (items && items.length) {
    for (const item of items) {
      let price = 0;
      if (isFixed && item.serviceCategory === 'car_wash') {
        price = await resolveCarWashPrice(item);
      } else if (item.price) {
        price = Number(item.price);
      }
      normalizedItems.push({
        serviceCategory: item.serviceCategory,
        subCategoryId: item.subCategoryId || null,
        details: item.details || {},
        price,
        isFixedPrice: isFixed,
      });
      subtotal += price;
    }
  } else if (isFixed && serviceDetails) {
    const price = await resolveCarWashPrice(serviceDetails);
    subtotal = price;
    normalizedItems.push({
      serviceCategory: category,
      details: serviceDetails,
      price,
      isFixedPrice: true,
    });
  } else {
    normalizedItems.push({
      serviceCategory: category,
      details: serviceDetails || {},
      price: 0,
      isFixedPrice: false,
    });
  }

  const { coupon, discount } = await resolveCoupon(couponCode, req.user._id, subtotal);

  const commissionRatePct = config.commissionRate || 10;
  const commissionAmount = isFixed ? calculateCommission(subtotal, commissionRatePct) : 0;

  const distanceFee = config.distanceFeePerKm ? 0 : 0;

  const methodAllowed = config.paymentMethods || { cash: true, card: true, wallet: true };
  if (!methodAllowed[paymentMethod]) {
    throw new BadRequestError(`Payment method ${paymentMethod} is not enabled`);
  }

  const order = await Order.create({
    clientId: req.user._id,
    serviceCategory: category,
    pricingType,
    serviceDetails: serviceDetails || {},
    items: normalizedItems,
    notes: notes || '',
    status: ORDER_STATUS.PENDING,
    location: {
      type: 'Point',
      coordinates: [parseFloat(lng), parseFloat(lat)],
      address: address || '',
    },
    agreedPrice: subtotal,
    subtotal,
    discountAmount: discount,
    distanceFee,
    totalPrice: Math.max(0, subtotal - discount + distanceFee),
    commission: {
      rate: commissionRatePct / 100,
      amount: commissionAmount,
    },
    providerPayout: Math.max(0, subtotal - discount + distanceFee - commissionAmount),
    paymentMethod: paymentMethod || PAYMENT_METHODS.CASH,
    couponCode: coupon?.code || '',
    couponId: coupon?._id || null,
    timeline: [{ status: ORDER_STATUS.PENDING, note: 'Order created', actorId: req.user._id, actorRole: USER_ROLES.CLIENT }],
  });

  if (coupon) {
    await Coupon.findByIdAndUpdate(coupon._id, {
      $inc: { usedCount: 1 },
      $addToSet: { usedBy: req.user._id },
    });
  }

  await auditService.record({
    actorType: 'user',
    actorId: req.user._id,
    action: 'order.create',
    targetType: 'Order',
    targetId: order._id,
    ipAddress: req.ip,
    correlationId: req.correlationId,
    diff: { subtotal, pricingType, category },
  });

  setImmediate(() => broadcast(order, _io));

  return success(res, { order }, 'Order created', 201);
});

const getMyOrders = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const skip = (page - 1) * limit;
  const status = req.query.status;

  const filter = { clientId: req.user._id };
  if (status) filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('providerId', 'name phone avatar rating')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  const { paginate } = require('../utils/response');
  return success(res, { orders }, 'success', 200, paginate(page, limit, total));
});

const getProviderOrders = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const skip = (page - 1) * limit;
  const status = req.query.status;

  const filter = { providerId: req.user._id };
  if (status) filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('clientId', 'name phone avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  const { paginate } = require('../utils/response');
  return success(res, { orders }, 'success', 200, paginate(page, limit, total));
});

const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('clientId', 'name phone avatar rating')
    .populate('providerId', 'name phone avatar rating')
    .populate('chatRoomId');

  if (!order) throw new NotFoundError('Order');

  const isClient = order.clientId._id.toString() === req.user._id.toString();
  const isProvider = order.providerId?._id?.toString() === req.user._id.toString();
  const isAdmin = req.user.role === 'admin';

  if (!isClient && !isProvider && !isAdmin) throw new ForbiddenError('Access denied');

  return success(res, { order });
});

const acceptOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');

  if (![ORDER_STATUS.PENDING, ORDER_STATUS.BROADCASTING].includes(order.status)) {
    throw new ConflictError('Order is no longer available');
  }

  if (order.rejectedBy.some((id) => id.toString() === req.user._id.toString())) {
    throw new ConflictError('You already rejected this order');
  }

  const provider = await Provider.findOne({ userId: req.user._id });
  if (!provider || provider.approvalStatus !== PROVIDER_APPROVAL.APPROVED) {
    throw new ForbiddenError('Provider not approved');
  }

  const updated = await Order.findOneAndUpdate(
    { _id: req.params.id, status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.BROADCASTING] } },
    {
      status: ORDER_STATUS.ACCEPTED,
      providerId: req.user._id,
      $push: {
        timeline: {
          status: ORDER_STATUS.ACCEPTED,
          note: 'Provider accepted the order',
          actorId: req.user._id,
          actorRole: USER_ROLES.PROVIDER,
          timestamp: new Date(),
        },
      },
    },
    { new: true }
  );

  if (!updated) throw new ConflictError('Order already taken');

  cancelTimeout(order._id.toString());

  if (_io) {
    _io.to(`user:${order.clientId}`).emit('order:accepted', {
      orderId: order._id,
      providerId: req.user._id,
      provider: {
        name: req.user.name,
        phone: req.user.phone,
        avatar: req.user.avatar,
        rating: req.user.rating,
      },
    });
  }

  await fcmService.sendToUser(order.clientId, NOTIFICATION_TYPES.ORDER_ACCEPTED, {
    orderId: order._id.toString(),
  });

  return success(res, { order: updated }, 'Order accepted');
});

const rejectOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');

  if (![ORDER_STATUS.PENDING, ORDER_STATUS.BROADCASTING].includes(order.status)) {
    throw new ConflictError('Order is no longer available');
  }

  await Order.findByIdAndUpdate(req.params.id, {
    $addToSet: { rejectedBy: req.user._id },
  });

  const updatedOrder = await Order.findById(req.params.id);
  setImmediate(() => broadcast(updatedOrder, _io));

  return success(res, {}, 'Order rejected');
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;

  const PROVIDER_ALLOWED = [
    ORDER_STATUS.IN_PROGRESS,
    ORDER_STATUS.ON_THE_WAY,
    ORDER_STATUS.ARRIVED,
    ORDER_STATUS.COMPLETED,
  ];
  const CLIENT_ALLOWED = [ORDER_STATUS.CANCELLED];

  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');

  const isProvider = order.providerId?.toString() === req.user._id.toString();
  const isClient = order.clientId.toString() === req.user._id.toString();

  if (isProvider && !PROVIDER_ALLOWED.includes(status)) {
    throw new BadRequestError('Invalid status transition for provider');
  }
  if (isClient && !CLIENT_ALLOWED.includes(status)) {
    throw new BadRequestError('Invalid status transition for client');
  }

  if (status === ORDER_STATUS.CANCELLED) {
    if ([ORDER_STATUS.ACCEPTED, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.ON_THE_WAY, ORDER_STATUS.ARRIVED].includes(order.status)) {
      throw new ForbiddenError('Cannot cancel order after provider accepted');
    }
    if (order.status === ORDER_STATUS.COMPLETED) {
      throw new ForbiddenError('Cannot cancel completed order');
    }
  }

  if (status === ORDER_STATUS.COMPLETED) {
    if (!order.photos.before.length || !order.photos.after.length) {
      throw new BadRequestError('Both before and after photos are required to complete the order');
    }
  }

  const actorRole = isProvider ? USER_ROLES.PROVIDER : isClient ? USER_ROLES.CLIENT : 'admin';

  const updated = await Order.findByIdAndUpdate(
    req.params.id,
    {
      status,
      ...(status === ORDER_STATUS.CANCELLED && {
        cancelledBy: req.user._id,
        cancelledAt: new Date(),
        cancellationReason: note || '',
      }),
      $push: {
        timeline: {
          status,
          note: note || '',
          actorId: req.user._id,
          actorRole,
          timestamp: new Date(),
        },
      },
    },
    { new: true }
  );

  if (status === ORDER_STATUS.COMPLETED) {
    try {
      await referralService.markQualifiedOnOrderCompletion(order._id, order.clientId);
    } catch (err) {
      require('../utils/logger').error({ err: err.message }, 'Referral qualification failed (non-fatal)');
    }
    try {
      await maskedPhoneService.terminateSessionForOrder(order._id);
    } catch (_) {}
  }

  if (_io) {
    _io.to(`order:${order._id}`).emit('order:status_update', {
      orderId: order._id,
      status,
    });
  }

  const notifyUserId = isProvider ? order.clientId : order.providerId;
  if (notifyUserId) {
    const notifType = status === ORDER_STATUS.COMPLETED
      ? NOTIFICATION_TYPES.ORDER_COMPLETED
      : status === ORDER_STATUS.CANCELLED
      ? NOTIFICATION_TYPES.ORDER_CANCELLED
      : NOTIFICATION_TYPES.ORDER_STATUS_UPDATE;
    await fcmService.sendToUser(notifyUserId, notifType, {
      orderId: order._id.toString(),
      status,
    });
  }

  return success(res, { order: updated }, 'Status updated');
});

const uploadOrderPhotos = asyncHandler(async (req, res) => {
  if (!req.files || !req.files.length) throw new BadRequestError('No files uploaded');
  const { phase } = req.body;
  if (!['before', 'after'].includes(phase)) throw new BadRequestError('phase must be before or after');

  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');

  const isProvider = order.providerId?.toString() === req.user._id.toString();
  if (!isProvider) throw new ForbiddenError('Only provider can upload photos');

  if (phase === 'after' && ![ORDER_STATUS.ARRIVED, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.COMPLETED].includes(order.status)) {
    throw new BadRequestError('After photos require arrival or later status');
  }

  const urls = req.files.map((f) => f.path);

  const updated = await Order.findByIdAndUpdate(
    req.params.id,
    { $push: { [`photos.${phase}`]: { $each: urls } } },
    { new: true }
  );

  return success(res, { photos: updated.photos }, 'Photos uploaded');
});

const setAgreedPrice = asyncHandler(async (req, res) => {
  const { price } = req.body;
  if (!price || price <= 0) throw new BadRequestError('Invalid price');

  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');

  const isProvider = order.providerId?.toString() === req.user._id.toString();
  if (!isProvider) throw new ForbiddenError('Only provider can set price');

  if (order.status !== ORDER_STATUS.ACCEPTED) {
    throw new BadRequestError('Price can only be set after acceptance');
  }

  const config = await Config.getAll();
  const commissionRatePct = config.commissionRate || 10;
  const priceHalalas = Math.round(price);
  const commissionAmount = calculateCommission(priceHalalas, commissionRatePct);
  const distanceFee = order.distanceFee || 0;
  const discount = order.discountAmount || 0;
  const totalPrice = Math.max(0, priceHalalas + distanceFee - discount);

  const updated = await Order.findByIdAndUpdate(
    req.params.id,
    {
      agreedPrice: priceHalalas,
      subtotal: priceHalalas,
      totalPrice,
      commission: {
        rate: commissionRatePct / 100,
        amount: commissionAmount,
      },
      providerPayout: Math.max(0, totalPrice - commissionAmount),
    },
    { new: true }
  );

  if (_io) {
    _io.to(`user:${order.clientId}`).emit('order:price_set', {
      orderId: order._id,
      agreedPrice: priceHalalas,
      totalPrice,
    });
  }

  return success(res, { order: updated }, 'Price set');
});

const getNearbyProviders = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');
  if (order.clientId.toString() !== req.user._id.toString()) throw new ForbiddenError('Access denied');

  const providers = await findNearbyProviders(order.serviceCategory, order.location.coordinates);
  const result = providers.map((p) => ({
    userId: p.userId._id || p.userId,
    name: p.user?.name,
    avatar: p.user?.avatar,
    rating: p.user?.rating,
    distance: Math.round(p.distance),
  }));

  return success(res, { providers: result });
});

const getTimeline = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).select('timeline clientId providerId');
  if (!order) throw new NotFoundError('Order');
  const allowed =
    order.clientId.toString() === req.user._id.toString() ||
    order.providerId?.toString() === req.user._id.toString() ||
    req.user.role === 'admin';
  if (!allowed) throw new ForbiddenError('Access denied');
  return success(res, { timeline: order.timeline });
});

const confirmCashReceipt = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');

  const isProvider = order.providerId?.toString() === req.user._id.toString();
  if (!isProvider) throw new ForbiddenError('Only provider can confirm cash receipt');

  if (order.paymentMethod !== PAYMENT_METHODS.CASH) {
    throw new BadRequestError('Order is not paid by cash');
  }
  if (order.status !== ORDER_STATUS.COMPLETED) {
    throw new BadRequestError('Order must be completed first');
  }
  if (order.cashSettledByProvider) throw new ConflictError('Cash already settled');

  await ledgerService.settleCashOrder({
    orderId: order._id,
    providerId: order.providerId,
    totalHalalas: order.totalPrice,
    commissionHalalas: order.commission.amount,
    idempotencyKey: `cash-settle-${order._id}`,
  });

  order.cashSettledByProvider = true;
  order.cashSettledAt = new Date();
  order.paymentStatus = PAYMENT_STATUS.SETTLED;
  await order.save();

  return success(res, { order }, 'Cash receipt confirmed');
});

module.exports = {
  setIo,
  createOrder,
  getMyOrders,
  getProviderOrders,
  getOrderById,
  acceptOrder,
  rejectOrder,
  updateOrderStatus,
  uploadOrderPhotos,
  setAgreedPrice,
  getNearbyProviders,
  getTimeline,
  confirmCashReceipt,
};
