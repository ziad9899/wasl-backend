const User = require('../models/User');
const Provider = require('../models/Provider');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Coupon = require('../models/Coupon');
const Config = require('../models/Config');
const Banner = require('../models/Banner');
const ServiceSubCategory = require('../models/ServiceSubCategory');
const CarWashPrice = require('../models/CarWashPrice');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const DSRRequest = require('../models/DSRRequest');
const AuditLog = require('../models/AuditLog');
const FraudFlag = require('../models/FraudFlag');
const LedgerTransaction = require('../models/LedgerTransaction');
const Account = require('../models/Account');
const Posting = require('../models/Posting');
const Notification = require('../models/Notification');
const fcmService = require('../services/fcm.service');
const ledgerService = require('../services/ledger.service');
const auditService = require('../services/audit.service');
const { success, paginate } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} = require('../errors');
const {
  NOTIFICATION_TYPES,
  WITHDRAWAL_STATUS,
  DSR_STATUS,
  DSR_TYPES,
  USER_STATUS,
  PROVIDER_APPROVAL,
  ACCOUNT_TYPES,
} = require('../constants');

const getDashboardStats = asyncHandler(async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    totalUsers,
    totalProviders,
    totalOrders,
    todayOrders,
    monthOrders,
    pendingProviders,
    activeOrders,
    revenueAgg,
    monthRevenueAgg,
    pendingWithdrawals,
    openFraudFlags,
    openDsr,
  ] = await Promise.all([
    User.countDocuments({ role: 'client' }),
    User.countDocuments({ role: 'provider' }),
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: today } }),
    Order.countDocuments({ createdAt: { $gte: thisMonth } }),
    Provider.countDocuments({ approvalStatus: PROVIDER_APPROVAL.PENDING }),
    Order.countDocuments({ status: { $in: ['accepted', 'in_progress', 'on_the_way', 'arrived'] } }),
    ledgerRevenueSince(null),
    ledgerRevenueSince(thisMonth),
    WithdrawalRequest.countDocuments({ status: WITHDRAWAL_STATUS.PENDING }),
    FraudFlag.countDocuments({ resolvedAt: null }),
    DSRRequest.countDocuments({ status: { $in: [DSR_STATUS.RECEIVED, DSR_STATUS.PROCESSING] } }),
  ]);

  return success(res, {
    users: { total: totalUsers, providers: totalProviders },
    orders: { total: totalOrders, today: todayOrders, month: monthOrders, active: activeOrders },
    providers: { pending: pendingProviders },
    revenue: { total: revenueAgg, month: monthRevenueAgg, currency: 'SAR_halalas' },
    operations: { pendingWithdrawals, openFraudFlags, openDsr },
  });
});

const ledgerRevenueSince = async (since) => {
  const revenue = await Account.findSystemAccount(ACCOUNT_TYPES.PLATFORM_REVENUE);
  if (!revenue) return 0;
  if (!since) return revenue.balance;
  const postings = await Posting.aggregate([
    { $match: { accountId: revenue._id, direction: 'CREDIT', createdAt: { $gte: since } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  return postings[0]?.total || 0;
};

const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const { search, role, status } = req.query;

  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  return success(res, { users }, 'success', 200, paginate(page, limit, total));
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw new NotFoundError('User');
  let provider = null;
  if (user.role === 'provider') provider = await Provider.findOne({ userId: user._id }).lean();
  return success(res, { user, provider });
});

const suspendUser = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new NotFoundError('User');
  if (user.role === 'admin') throw new BadRequestError('Cannot suspend admin via this route');

  await User.findByIdAndUpdate(req.params.id, { status: USER_STATUS.SUSPENDED });
  await fcmService.sendToUser(req.params.id, NOTIFICATION_TYPES.ACCOUNT_SUSPENDED, { note: note || '' });
  return success(res, {}, 'User suspended');
});

const activateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new NotFoundError('User');

  await User.findByIdAndUpdate(req.params.id, { status: USER_STATUS.ACTIVE });
  if (user.role === 'provider') {
    await Provider.findOneAndUpdate({ userId: req.params.id }, { autoSuspended: false });
  }
  await fcmService.sendToUser(req.params.id, NOTIFICATION_TYPES.ACCOUNT_REACTIVATED, {});
  return success(res, {}, 'User activated');
});

const getPendingProviders = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const [providers, total] = await Promise.all([
    Provider.find({ approvalStatus: PROVIDER_APPROVAL.PENDING })
      .populate('userId', 'name phone email avatar createdAt')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Provider.countDocuments({ approvalStatus: PROVIDER_APPROVAL.PENDING }),
  ]);

  return success(res, { providers }, 'success', 200, paginate(page, limit, total));
});

const approveProvider = asyncHandler(async (req, res) => {
  const provider = await Provider.findOne({ userId: req.params.id });
  if (!provider) throw new NotFoundError('Provider');

  await Provider.findOneAndUpdate(
    { userId: req.params.id },
    { approvalStatus: PROVIDER_APPROVAL.APPROVED, approvalNote: '', approvedAt: new Date(), approvedBy: req.admin?._id }
  );
  await User.findByIdAndUpdate(req.params.id, { status: USER_STATUS.ACTIVE });

  try {
    await ledgerService.getOrCreateUserAccount(req.params.id, ACCOUNT_TYPES.PROVIDER_WALLET);
    await ledgerService.getOrCreateUserAccount(req.params.id, ACCOUNT_TYPES.PROVIDER_COMMISSION_DEBT);
  } catch (_) {}

  await fcmService.sendToUser(req.params.id, NOTIFICATION_TYPES.ACCOUNT_APPROVED, {});
  return success(res, {}, 'Provider approved');
});

const rejectProvider = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const provider = await Provider.findOne({ userId: req.params.id });
  if (!provider) throw new NotFoundError('Provider');

  await Provider.findOneAndUpdate(
    { userId: req.params.id },
    { approvalStatus: PROVIDER_APPROVAL.REJECTED, approvalNote: note || '' }
  );

  await fcmService.sendToUser(req.params.id, NOTIFICATION_TYPES.ACCOUNT_SUSPENDED, { note: note || '' });
  return success(res, {}, 'Provider rejected');
});

const verifyProviderDocument = asyncHandler(async (req, res) => {
  const { docType, side, verified } = req.body;
  const path = side ? `documents.${docType}.${side}.verified` : `documents.${docType}.verified`;
  const provider = await Provider.findOneAndUpdate(
    { userId: req.params.id },
    { $set: { [path]: Boolean(verified) } },
    { new: true }
  );
  if (!provider) throw new NotFoundError('Provider');
  return success(res, { documents: provider.documents }, 'Document verification updated');
});

const getAllOrders = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const { status, category, from, to } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (category) filter.serviceCategory = category;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('clientId', 'name phone')
      .populate('providerId', 'name phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return success(res, { orders }, 'success', 200, paginate(page, limit, total));
});

const forceCancelOrder = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');

  await Order.findByIdAndUpdate(req.params.id, {
    status: 'cancelled',
    cancelledBy: req.admin._id,
    cancelledAt: new Date(),
    cancellationReason: reason || 'Admin force-cancel',
    $push: {
      timeline: {
        status: 'cancelled',
        note: reason || 'Admin force-cancel',
        actorId: req.admin._id,
        actorRole: 'admin',
        timestamp: new Date(),
      },
    },
  });

  return success(res, {}, 'Order force-cancelled');
});

const refundOrder = asyncHandler(async (req, res) => {
  const { reason, amount } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) throw new NotFoundError('Order');
  if (order.paymentStatus !== 'captured' && order.paymentStatus !== 'settled') {
    throw new BadRequestError('Order not in refundable state');
  }
  const refundAmount = amount ? Math.round(Number(amount)) : order.totalPrice;

  await ledgerService.refundOrder({
    orderId: order._id,
    clientId: order.clientId,
    amountHalalas: refundAmount,
    idempotencyKey: `refund-${order._id}-${Date.now()}`,
    reason: reason || 'admin',
  });

  await Order.findByIdAndUpdate(order._id, {
    paymentStatus: 'refunded',
  });

  return success(res, {}, 'Order refunded');
});

const getRevenueReport = asyncHandler(async (req, res) => {
  const { from, to, groupBy } = req.query;
  const revenue = await Account.findSystemAccount(ACCOUNT_TYPES.PLATFORM_REVENUE);
  if (!revenue) return success(res, { report: [], totals: { totalRevenue: 0, totalOrders: 0 } });

  const match = { accountId: revenue._id, direction: 'CREDIT' };
  if (from || to) {
    match.createdAt = {};
    if (from) match.createdAt.$gte = new Date(from);
    if (to) match.createdAt.$lte = new Date(to);
  }

  const dateFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'year' ? '%Y' : '%Y-%m-%d';

  const report = await Posting.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$createdAt' } },
        revenue: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const totals = await Posting.aggregate([
    { $match: match },
    { $group: { _id: null, totalRevenue: { $sum: '$amount' }, totalOrders: { $sum: 1 } } },
  ]);

  return success(res, { report, totals: totals[0] || { totalRevenue: 0, totalOrders: 0 } });
});

const getProvidersPerformance = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const result = await Order.aggregate([
    { $match: { status: 'completed', providerId: { $ne: null } } },
    {
      $group: {
        _id: '$providerId',
        completedOrders: { $sum: 1 },
        totalRevenue: { $sum: '$totalPrice' },
        avgPrice: { $avg: '$totalPrice' },
      },
    },
    { $sort: { completedOrders: -1 } },
    { $skip: skip },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'provider',
      },
    },
    { $unwind: '$provider' },
    {
      $project: {
        _id: 1,
        completedOrders: 1,
        totalRevenue: 1,
        avgPrice: { $round: ['$avgPrice', 2] },
        name: '$provider.name',
        phone: '$provider.phone',
        rating: '$provider.rating',
        status: '$provider.status',
      },
    },
  ]);

  const total = await User.countDocuments({ role: 'provider' });
  return success(res, { providers: result }, 'success', 200, paginate(page, limit, total));
});

const getTrialBalance = asyncHandler(async (req, res) => {
  const status = await ledgerService.reconcile();
  return success(res, status);
});

const getLedgerStatement = asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const skip = (page - 1) * limit;

  const account = await Account.findById(accountId);
  if (!account) throw new NotFoundError('Account');

  const [postings, total] = await Promise.all([
    Posting.find({ accountId })
      .populate('txId', 'kind narration orderId postedAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Posting.countDocuments({ accountId }),
  ]);

  return success(res, { account, postings }, 'success', 200, paginate(page, limit, total));
});

const getWithdrawals = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const { status } = req.query;

  const filter = {};
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    WithdrawalRequest.find(filter)
      .populate('providerId', 'name phone email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    WithdrawalRequest.countDocuments(filter),
  ]);

  return success(res, { withdrawals: items }, 'success', 200, paginate(page, limit, total));
});

const approveWithdrawal = asyncHandler(async (req, res) => {
  const wr = await WithdrawalRequest.findById(req.params.id);
  if (!wr) throw new NotFoundError('Withdrawal request');
  if (wr.status !== WITHDRAWAL_STATUS.PENDING) throw new ConflictError('Already processed');

  await ledgerService.completeWithdrawalPayout({
    amountHalalas: wr.amount,
    externalRef: wr._id.toString(),
    idempotencyKey: `withdrawal-paid-${wr._id}`,
  });

  wr.status = WITHDRAWAL_STATUS.PAID;
  wr.processedBy = req.admin._id;
  wr.processedAt = new Date();
  wr.externalRef = req.body.externalRef || '';
  await wr.save();

  await fcmService.sendToUser(wr.providerId, NOTIFICATION_TYPES.WITHDRAWAL_PROCESSED, {
    withdrawalId: wr._id.toString(),
    amount: String(wr.amount),
  });

  return success(res, { withdrawal: wr }, 'Withdrawal approved and paid');
});

const rejectWithdrawal = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const wr = await WithdrawalRequest.findById(req.params.id);
  if (!wr) throw new NotFoundError('Withdrawal request');
  if (wr.status !== WITHDRAWAL_STATUS.PENDING) throw new ConflictError('Already processed');

  await ledgerService.rejectWithdrawal({
    providerId: wr.providerId,
    amountHalalas: wr.amount,
    idempotencyKey: `withdrawal-rejected-${wr._id}`,
    reason: reason || 'admin rejection',
  });

  wr.status = WITHDRAWAL_STATUS.REJECTED;
  wr.rejectionReason = reason || '';
  wr.processedBy = req.admin._id;
  wr.processedAt = new Date();
  await wr.save();

  await fcmService.sendToUser(wr.providerId, NOTIFICATION_TYPES.WITHDRAWAL_REJECTED, {
    withdrawalId: wr._id.toString(),
    reason: reason || '',
  });

  return success(res, { withdrawal: wr }, 'Withdrawal rejected');
});

const deleteReview = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const review = await Review.findById(req.params.id);
  if (!review) throw new NotFoundError('Review');

  await Review.findByIdAndUpdate(req.params.id, {
    isDeletedByAdmin: true,
    deletedByAdminId: req.admin._id,
    deletedReason: reason || '',
  });

  const { recalculateRating } = require('../services/review.service');
  await recalculateRating(review.toUser);

  return success(res, {}, 'Review deleted');
});

const createCoupon = asyncHandler(async (req, res) => {
  const body = req.body;
  const coupon = await Coupon.create({
    code: body.code.toUpperCase(),
    title_ar: body.title_ar || body.code,
    title_en: body.title_en || body.code,
    discountType: body.discountType,
    discountValue: body.discountValue,
    maxUses: body.maxUses || null,
    maxUsesPerUser: body.maxUsesPerUser || 1,
    minOrderValue: body.minOrderValue || 0,
    maxDiscount: body.maxDiscount || null,
    applicableCategories: body.applicableCategories || [],
    startsAt: body.startsAt || null,
    expiresAt: body.expiresAt || null,
    createdBy: req.admin._id,
  });
  return success(res, { coupon }, 'Coupon created', 201);
});

const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!coupon) throw new NotFoundError('Coupon');
  return success(res, { coupon }, 'Coupon updated');
});

const getCoupons = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const filter = {};
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;

  const [coupons, total] = await Promise.all([
    Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Coupon.countDocuments(filter),
  ]);

  return success(res, { coupons }, 'success', 200, paginate(page, limit, total));
});

const toggleCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);
  if (!coupon) throw new NotFoundError('Coupon');
  coupon.isActive = !coupon.isActive;
  await coupon.save();
  return success(res, { isActive: coupon.isActive }, 'Coupon toggled');
});

const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) throw new NotFoundError('Coupon');
  return success(res, {}, 'Coupon deleted');
});

const getConfigs = asyncHandler(async (req, res) => {
  const configs = await Config.getAll();
  return success(res, { configs });
});

const updateConfig = asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) throw new BadRequestError('key and value are required');
  await Config.set(key, value);
  return success(res, {}, 'Config updated');
});

const sendBroadcastNotification = asyncHandler(async (req, res) => {
  const { title_ar, title_en, body_ar, body_en, role } = req.body;
  const filter = { status: USER_STATUS.ACTIVE };
  if (role && role !== 'all') filter.role = role;

  const users = await User.find(filter).select('_id').lean();
  const ids = users.map((u) => u._id.toString());

  await fcmService.sendToMany(ids, NOTIFICATION_TYPES.PROMO, {}, { title_ar, title_en, body_ar, body_en });
  return success(res, { sent: ids.length }, 'Broadcast sent');
});

const getAllReviews = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const { role } = req.query;

  const filter = { isDeletedByAdmin: false };
  if (role) filter.role = role;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('fromUser', 'name avatar')
      .populate('toUser', 'name avatar')
      .populate('orderId', 'orderNumber serviceCategory')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return success(res, { reviews }, 'success', 200, paginate(page, limit, total));
});

const getAuditLogs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.actor) filter.actorId = req.query.actor;
  if (req.query.target) filter.targetId = req.query.target;
  if (req.query.action) filter.action = req.query.action;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
  }

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);

  return success(res, { logs }, 'success', 200, paginate(page, limit, total));
});

const getDsrRequests = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;

  const [items, total] = await Promise.all([
    DSRRequest.find(filter)
      .populate('userId', 'name phone email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DSRRequest.countDocuments(filter),
  ]);

  return success(res, { requests: items }, 'success', 200, paginate(page, limit, total));
});

const processDsr = asyncHandler(async (req, res) => {
  const { action, reason } = req.body;
  const dsr = await DSRRequest.findById(req.params.id);
  if (!dsr) throw new NotFoundError('DSR request');

  if (action === 'approve') {
    if (dsr.type === DSR_TYPES.ERASURE) {
      await User.findByIdAndUpdate(dsr.userId, {
        deletedAt: new Date(),
        status: USER_STATUS.SUSPENDED,
        name: 'DELETED',
        email: null,
        phone: `deleted-${dsr.userId}`,
      });
    }
    dsr.status = DSR_STATUS.COMPLETED;
    dsr.completedAt = new Date();
    dsr.processedBy = req.admin._id;
  } else {
    dsr.status = DSR_STATUS.REJECTED;
    dsr.rejectionReason = reason || '';
    dsr.processedBy = req.admin._id;
    dsr.completedAt = new Date();
  }

  await dsr.save();
  return success(res, { dsr }, 'DSR processed');
});

const listFraudFlags = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.severity) filter.severity = req.query.severity;
  if (req.query.resolved === 'false') filter.resolvedAt = null;
  if (req.query.resolved === 'true') filter.resolvedAt = { $ne: null };

  const [flags, total] = await Promise.all([
    FraudFlag.find(filter)
      .populate('userId', 'name phone role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FraudFlag.countDocuments(filter),
  ]);

  return success(res, { flags }, 'success', 200, paginate(page, limit, total));
});

const resolveFraudFlag = asyncHandler(async (req, res) => {
  const { note } = req.body;
  const flag = await FraudFlag.findByIdAndUpdate(
    req.params.id,
    { resolvedAt: new Date(), resolvedBy: req.admin._id, resolutionNote: note || '' },
    { new: true }
  );
  if (!flag) throw new NotFoundError('Fraud flag');
  return success(res, { flag });
});

const createBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.create({ ...req.body, createdBy: req.admin._id });
  return success(res, { banner }, 'Banner created', 201);
});

const updateBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!banner) throw new NotFoundError('Banner');
  return success(res, { banner });
});

const listBanners = asyncHandler(async (req, res) => {
  const banners = await Banner.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
  return success(res, { banners });
});

const deleteBanner = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) throw new NotFoundError('Banner');
  return success(res, {}, 'Banner deleted');
});

const createSubCategory = asyncHandler(async (req, res) => {
  const sub = await ServiceSubCategory.create(req.body);
  return success(res, { subCategory: sub }, 'Subcategory created', 201);
});

const updateSubCategory = asyncHandler(async (req, res) => {
  const sub = await ServiceSubCategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!sub) throw new NotFoundError('Subcategory');
  return success(res, { subCategory: sub });
});

const listSubCategories = asyncHandler(async (req, res) => {
  const subs = await ServiceSubCategory.find().sort({ parent: 1, sortOrder: 1 }).lean();
  return success(res, { subCategories: subs });
});

const deleteSubCategory = asyncHandler(async (req, res) => {
  const sub = await ServiceSubCategory.findByIdAndDelete(req.params.id);
  if (!sub) throw new NotFoundError('Subcategory');
  return success(res, {}, 'Subcategory deleted');
});

const createCarWashPrice = asyncHandler(async (req, res) => {
  const price = await CarWashPrice.create({ ...req.body, updatedBy: req.admin._id });
  return success(res, { price }, 'Price created', 201);
});

const updateCarWashPrice = asyncHandler(async (req, res) => {
  const price = await CarWashPrice.findByIdAndUpdate(
    req.params.id,
    { ...req.body, updatedBy: req.admin._id },
    { new: true }
  );
  if (!price) throw new NotFoundError('Price');
  return success(res, { price });
});

const listCarWashPrices = asyncHandler(async (req, res) => {
  const prices = await CarWashPrice.find().sort({ vehicleSize: 1, washType: 1 }).lean();
  return success(res, { prices });
});

const deleteCarWashPrice = asyncHandler(async (req, res) => {
  const price = await CarWashPrice.findByIdAndDelete(req.params.id);
  if (!price) throw new NotFoundError('Price');
  return success(res, {}, 'Price deleted');
});

const healthReconciliation = asyncHandler(async (req, res) => {
  const result = await ledgerService.reconcile();
  return success(res, result);
});

// Admin-only image upload helper. Routes a single multipart "image" field
// through Cloudinary (same security stack as provider docs: 5MB cap, MIME
// allowlist jpg/png/webp, extension allowlist) and returns the resulting
// CDN URL so the admin UI can drop it into a Banner or other catalog row.
const uploadAdminImage = asyncHandler(async (req, res) => {
  if (!req.file) throw new BadRequestError('No image uploaded');
  return success(res, {
    url:      req.file.path,
    publicId: req.file.filename,
    bytes:    req.file.size,
  }, 'Uploaded');
});

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUserById,
  suspendUser,
  activateUser,
  getPendingProviders,
  approveProvider,
  rejectProvider,
  verifyProviderDocument,
  getAllOrders,
  forceCancelOrder,
  refundOrder,
  getRevenueReport,
  getProvidersPerformance,
  getTrialBalance,
  getLedgerStatement,
  getWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
  deleteReview,
  createCoupon,
  updateCoupon,
  getCoupons,
  toggleCoupon,
  deleteCoupon,
  getConfigs,
  updateConfig,
  sendBroadcastNotification,
  getAllReviews,
  getAuditLogs,
  getDsrRequests,
  processDsr,
  listFraudFlags,
  resolveFraudFlag,
  createBanner,
  updateBanner,
  listBanners,
  deleteBanner,
  uploadAdminImage,
  createSubCategory,
  updateSubCategory,
  listSubCategories,
  deleteSubCategory,
  createCarWashPrice,
  updateCarWashPrice,
  listCarWashPrices,
  deleteCarWashPrice,
  healthReconciliation,
};
