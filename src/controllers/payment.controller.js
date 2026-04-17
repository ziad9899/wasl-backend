const Order = require('../models/Order');
const Config = require('../models/Config');
const Coupon = require('../models/Coupon');
const LedgerTransaction = require('../models/LedgerTransaction');
const WithdrawalRequest = require('../models/WithdrawalRequest');
const Provider = require('../models/Provider');
const walletService = require('../services/wallet.service');
const ledgerService = require('../services/ledger.service');
const otpService = require('../services/otp.service');
const fcmService = require('../services/fcm.service');
const paymentGateway = require('../services/payment-gateway.service');
const auditService = require('../services/audit.service');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  DomainError,
} = require('../errors');
const {
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  NOTIFICATION_TYPES,
  CONFIG_KEYS,
  WITHDRAWAL_STATUS,
  ACCOUNT_TYPES,
} = require('../constants');

const validateCoupon = asyncHandler(async (req, res) => {
  const { code, orderValue } = req.body;

  const coupon = await Coupon.findOne({
    code: code.toUpperCase(),
    isActive: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });

  if (!coupon) throw new BadRequestError('Invalid or expired coupon');

  if (coupon.usedBy.some((u) => u.toString() === req.user._id.toString())) {
    throw new ConflictError('Coupon already used');
  }
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses) {
    throw new BadRequestError('Coupon usage limit reached');
  }
  const orderValueHalalas = Math.round(Number(orderValue || 0));
  if (orderValueHalalas < coupon.minOrderValue) {
    throw new BadRequestError(`Minimum order value is ${coupon.minOrderValue / 100} SAR`);
  }

  let discountAmount = 0;
  if (coupon.discountType === 'percentage') {
    discountAmount = Math.round((orderValueHalalas * coupon.discountValue) / 100);
    if (coupon.maxDiscount) discountAmount = Math.min(discountAmount, coupon.maxDiscount);
  } else {
    discountAmount = coupon.discountValue;
  }

  return success(res, {
    coupon: {
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount,
    },
  });
});

const payWithWallet = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');
  if (order.clientId.toString() !== req.user._id.toString()) throw new ForbiddenError('Access denied');

  if (order.paymentStatus === PAYMENT_STATUS.CAPTURED || order.paymentStatus === PAYMENT_STATUS.SETTLED) {
    throw new ConflictError('Order already paid');
  }

  if (!['accepted', 'in_progress', 'on_the_way', 'arrived', 'completed'].includes(order.status)) {
    throw new BadRequestError('Order not ready for payment');
  }

  await ledgerService.payOrderFromWallet({
    orderId: order._id,
    clientId: order.clientId,
    providerId: order.providerId,
    totalHalalas: order.totalPrice,
    commissionHalalas: order.commission.amount,
    idempotencyKey: `wallet-pay-${order._id}`,
  });

  await Order.findByIdAndUpdate(orderId, {
    paymentStatus: PAYMENT_STATUS.CAPTURED,
    paymentMethod: PAYMENT_METHODS.WALLET,
    paymentCapturedAt: new Date(),
  });

  await fcmService.sendToUser(order.providerId.toString(), NOTIFICATION_TYPES.PAYMENT_RECEIVED, {
    orderId: orderId.toString(),
    amount: String(order.totalPrice),
  });

  return success(res, {}, 'Payment successful');
});

const getWalletBalance = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (role === 'provider') {
    const [balance, debt] = await Promise.all([
      walletService.getProviderBalance(req.user._id),
      walletService.getProviderCommissionDebt(req.user._id),
    ]);
    return success(res, { balance, commissionDebt: debt, currency: 'SAR' });
  }
  const balance = await walletService.getBalance(req.user._id);
  return success(res, { balance, currency: 'SAR' });
});

const topupWallet = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const amountHalalas = Math.round(Number(amount));
  if (!amountHalalas || amountHalalas < 1000 || amountHalalas > 500000) {
    throw new BadRequestError('Amount must be between 10 SAR and 5000 SAR');
  }

  const returnUrl = `${process.env.CLIENT_URL || 'https://wasl.sa'}/wallet/topup/callback`;

  const session = await paymentGateway.moyasarCreateCheckout({
    amountHalalas,
    description: `Wallet topup for user ${req.user._id}`,
    userId: req.user._id,
    returnUrl,
    metadata: { kind: 'wallet_topup' },
  });

  return success(res, {
    sessionId: session.sessionId,
    checkoutUrl: session.checkoutUrl,
    provider: session.provider,
    amount: amountHalalas,
    stub: !!session.stub,
  }, 'Topup session created', 201);
});

const checkoutOrderCard = asyncHandler(async (req, res) => {
  const { orderId, paymentMethod } = req.body;
  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');
  if (order.clientId.toString() !== req.user._id.toString()) throw new ForbiddenError('Access denied');
  if (order.paymentStatus === PAYMENT_STATUS.CAPTURED) throw new ConflictError('Already paid');

  const returnUrl = `${process.env.CLIENT_URL || 'https://wasl.sa'}/orders/${order._id}/callback`;

  const session = await paymentGateway.moyasarCreateCheckout({
    amountHalalas: order.totalPrice,
    description: `Order ${order.orderNumber}`,
    userId: req.user._id,
    orderId: order._id,
    returnUrl,
    metadata: { kind: 'order_payment', method: paymentMethod },
  });

  await Order.findByIdAndUpdate(orderId, {
    paymentMethod: paymentMethod || PAYMENT_METHODS.CARD,
    paymentReference: session.sessionId,
    paymentGateway: 'moyasar',
  });

  return success(res, session, 'Checkout session created', 201);
});

const checkoutOrderTabby = asyncHandler(async (req, res) => {
  const { orderId, returnUrl, cancelUrl } = req.body;
  const order = await Order.findById(orderId).populate('clientId', 'name email phone');
  if (!order) throw new NotFoundError('Order');
  if (order.clientId._id.toString() !== req.user._id.toString()) throw new ForbiddenError('Access denied');
  if (order.paymentStatus === PAYMENT_STATUS.CAPTURED) throw new ConflictError('Already paid');

  const session = await paymentGateway.tabbyCreateCheckout({
    amountHalalas: order.totalPrice,
    orderId: order._id,
    userId: req.user._id,
    buyer: {
      phone: order.clientId.phone,
      email: order.clientId.email || 'noemail@wasl.sa',
      name: order.clientId.name || 'Customer',
    },
    items: order.items.map((i) => ({
      title: i.serviceCategory,
      unit_price: (i.price / 100).toFixed(2),
      quantity: 1,
      category: i.serviceCategory,
    })),
    returnUrl: returnUrl || `${process.env.CLIENT_URL || 'https://wasl.sa'}/orders/${order._id}/success`,
    cancelUrl: cancelUrl || `${process.env.CLIENT_URL || 'https://wasl.sa'}/orders/${order._id}/cancel`,
  });

  await Order.findByIdAndUpdate(orderId, {
    paymentMethod: PAYMENT_METHODS.TABBY,
    paymentReference: session.sessionId,
    paymentGateway: 'tabby',
  });

  return success(res, session, 'Tabby checkout created', 201);
});

const requestWithdrawal = asyncHandler(async (req, res) => {
  const { amount, otpCode } = req.body;
  const amountHalalas = Math.round(Number(amount));

  if (req.user.role !== 'provider') throw new ForbiddenError('Only providers can request withdrawals');

  await otpService.verifyOtp(req.user.phone, otpCode, { purpose: 'withdrawal_confirm' });

  const config = await Config.getAll();
  const minW = config[CONFIG_KEYS.MIN_WITHDRAWAL] || 10000;
  const maxDay = config[CONFIG_KEYS.MAX_WITHDRAWAL_PER_DAY] || 500000;

  if (amountHalalas < minW) throw new BadRequestError(`Minimum withdrawal is ${minW / 100} SAR`);

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const todayTotal = await WithdrawalRequest.aggregate([
    {
      $match: {
        providerId: req.user._id,
        createdAt: { $gte: startOfDay },
        status: { $in: [WITHDRAWAL_STATUS.PENDING, WITHDRAWAL_STATUS.APPROVED, WITHDRAWAL_STATUS.PROCESSING, WITHDRAWAL_STATUS.PAID] },
      },
    },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const todaySum = todayTotal[0]?.total || 0;
  if (todaySum + amountHalalas > maxDay) {
    throw new BadRequestError(`Daily withdrawal limit is ${maxDay / 100} SAR`);
  }

  const provider = await Provider.findOne({ userId: req.user._id });
  if (!provider || !provider.bankInfo?.iban) throw new BadRequestError('IBAN not configured');

  const balance = await walletService.getProviderBalance(req.user._id);
  const debt = await walletService.getProviderCommissionDebt(req.user._id);
  if (balance - debt < amountHalalas) throw new BadRequestError('Insufficient balance after debt');

  const wr = await WithdrawalRequest.create({
    providerId: req.user._id,
    amount: amountHalalas,
    bankIban: provider.bankInfo.iban,
    accountName: provider.bankInfo.accountName,
    bankName: provider.bankInfo.bankName,
    status: WITHDRAWAL_STATUS.PENDING,
  });

  const ledgerTx = await ledgerService.processWithdrawalDebit({
    providerId: req.user._id,
    amountHalalas,
    idempotencyKey: `withdrawal-hold-${wr._id}`,
    externalRef: wr._id.toString(),
  });
  wr.ledgerTxId = ledgerTx.transaction._id;
  await wr.save();

  await auditService.record({
    actorType: 'user',
    actorId: req.user._id,
    action: 'withdrawal.request',
    targetType: 'WithdrawalRequest',
    targetId: wr._id,
    ipAddress: req.ip,
    correlationId: req.correlationId,
  });

  return success(res, { withdrawal: wr }, 'Withdrawal request submitted', 201);
});

const tabbyWebhook = asyncHandler(async (req, res) => {
  if (!paymentGateway.checkTabbyIp(req)) throw new ForbiddenError('IP not allowlisted');

  const signature = req.headers['x-tabby-signature'] || req.headers['x-signature'];
  const rawBody = JSON.stringify(req.body);
  if (!paymentGateway.tabbyVerifyWebhook(rawBody, signature)) {
    throw new ForbiddenError('Invalid webhook signature');
  }

  const { event, data } = req.body;
  const sessionId = data?.id || data?.payment_id;

  if (!sessionId) return success(res, { received: true });

  const order = await Order.findOne({ paymentReference: sessionId });
  if (!order) {
    require('../utils/logger').warn({ sessionId }, 'Tabby webhook for unknown order');
    return success(res, { received: true });
  }

  if (['payment.captured', 'authorized'].includes(event) || data?.status === 'AUTHORIZED') {
    await ledgerService.postTransaction({
      idempotencyKey: `tabby-capture-${sessionId}`,
      kind: 'order_payment_tabby',
      orderId: order._id,
      narration: `Tabby capture ${sessionId}`,
      entries: [
        {
          accountId: (await require('../models/Account').findSystemAccount(ACCOUNT_TYPES.PAYMENT_GATEWAY_CLEARING))._id,
          direction: 'DEBIT',
          amount: order.totalPrice,
        },
        {
          accountId: (await ledgerService.getOrCreateUserAccount(order.providerId, ACCOUNT_TYPES.PROVIDER_WALLET))._id,
          direction: 'CREDIT',
          amount: order.providerPayout,
        },
        {
          accountId: (await require('../models/Account').findSystemAccount(ACCOUNT_TYPES.PLATFORM_REVENUE))._id,
          direction: 'CREDIT',
          amount: order.commission.amount,
        },
      ],
    });

    await Order.findByIdAndUpdate(order._id, {
      paymentStatus: PAYMENT_STATUS.CAPTURED,
      paymentCapturedAt: new Date(),
    });

    await fcmService.sendToUser(order.providerId, NOTIFICATION_TYPES.PAYMENT_RECEIVED, {
      orderId: order._id.toString(),
    });
  }

  if (event === 'payment.failed' || data?.status === 'REJECTED') {
    await Order.findByIdAndUpdate(order._id, { paymentStatus: PAYMENT_STATUS.FAILED });
    await fcmService.sendToUser(order.clientId, NOTIFICATION_TYPES.PAYMENT_FAILED, {
      orderId: order._id.toString(),
    });
  }

  return success(res, { received: true });
});

const moyasarWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-moyasar-signature'] || req.headers['x-signature'];
  const rawBody = JSON.stringify(req.body);
  if (!paymentGateway.moyasarVerifyWebhook(rawBody, signature)) {
    throw new ForbiddenError('Invalid webhook signature');
  }

  const { type, data } = req.body;
  const sessionId = data?.id;

  if (!sessionId) return success(res, { received: true });

  const metadata = data?.metadata || {};

  if (metadata.kind === 'wallet_topup') {
    if (type === 'payment_paid' || data?.status === 'paid') {
      await ledgerService.topupWalletFromGateway({
        userId: metadata.userId,
        amountHalalas: data.amount,
        gatewayRef: sessionId,
        idempotencyKey: `moyasar-topup-${sessionId}`,
      });
    }
    return success(res, { received: true });
  }

  if (metadata.kind === 'order_payment') {
    const order = await Order.findById(metadata.orderId);
    if (!order) return success(res, { received: true });

    if (type === 'payment_paid' || data?.status === 'paid') {
      const Account = require('../models/Account');
      const clearing = await Account.findSystemAccount(ACCOUNT_TYPES.PAYMENT_GATEWAY_CLEARING);
      const providerWallet = await ledgerService.getOrCreateUserAccount(order.providerId, ACCOUNT_TYPES.PROVIDER_WALLET);
      const revenue = await Account.findSystemAccount(ACCOUNT_TYPES.PLATFORM_REVENUE);

      await ledgerService.postTransaction({
        idempotencyKey: `moyasar-capture-${sessionId}`,
        kind: order.paymentMethod === 'apple_pay' ? 'order_payment_apple_pay' : 'order_payment_card',
        orderId: order._id,
        narration: `Moyasar capture ${sessionId}`,
        entries: [
          { accountId: clearing._id, direction: 'DEBIT', amount: order.totalPrice },
          { accountId: providerWallet._id, direction: 'CREDIT', amount: order.providerPayout },
          { accountId: revenue._id, direction: 'CREDIT', amount: order.commission.amount },
        ],
      });

      await Order.findByIdAndUpdate(order._id, {
        paymentStatus: PAYMENT_STATUS.CAPTURED,
        paymentCapturedAt: new Date(),
      });
    } else if (type === 'payment_failed') {
      await Order.findByIdAndUpdate(order._id, { paymentStatus: PAYMENT_STATUS.FAILED });
    }
  }

  return success(res, { received: true });
});

const simulatePaymentStub = asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') throw new ForbiddenError('Stub disabled in production');
  const { sessionId, provider, success: ok = true } = req.body;
  const webhookBody = await paymentGateway.simulateWebhookFromStub({ provider, sessionId, success: ok });

  const handler = provider === 'tabby' ? tabbyWebhook : moyasarWebhook;
  req.body = provider === 'tabby'
    ? { event: webhookBody.event, data: { id: sessionId, status: ok ? 'AUTHORIZED' : 'REJECTED' } }
    : {
        type: ok ? 'payment_paid' : 'payment_failed',
        data: {
          id: sessionId,
          status: ok ? 'paid' : 'failed',
          amount: req.body.amount || 0,
          metadata: req.body.metadata || {},
        },
      };
  return handler(req, res);
});

const listTransactions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const { items, total } = await walletService.getUserTransactions(req.user._id, { page, limit });
  const { paginate } = require('../utils/response');
  return success(res, { transactions: items }, 'success', 200, paginate(page, limit, total));
});

module.exports = {
  validateCoupon,
  payWithWallet,
  getWalletBalance,
  topupWallet,
  checkoutOrderCard,
  checkoutOrderTabby,
  requestWithdrawal,
  tabbyWebhook,
  moyasarWebhook,
  simulatePaymentStub,
  listTransactions,
};
