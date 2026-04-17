const axios = require('axios');
const crypto = require('crypto');
const MaskedPhoneSession = require('../models/MaskedPhoneSession');
const User = require('../models/User');
const Order = require('../models/Order');
const logger = require('../utils/logger');
const { NotFoundError, ForbiddenError, BadRequestError, IntegrationError } = require('../errors');

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const STUB_MODE = !process.env.UNIFONIC_API_KEY || process.env.UNIFONIC_STUB === 'true';

const generateStubMaskedNumber = () => {
  const suffix = crypto.randomInt(1000, 9999);
  return `+96680${suffix}${crypto.randomInt(1000, 9999)}`;
};

const requestUnifonicSession = async (clientPhone, providerPhone, orderId) => {
  if (STUB_MODE) {
    logger.info({ orderId }, 'Masked phone stub — generating fake masked number');
    return {
      externalSessionId: `stub-${crypto.randomUUID()}`,
      maskedNumber: generateStubMaskedNumber(),
    };
  }

  try {
    const response = await axios.post(
      `${process.env.UNIFONIC_BASE_URL || 'https://api.unifonic.com'}/voice/masked`,
      {
        partyA: clientPhone,
        partyB: providerPhone,
        reference: orderId,
        ttlSeconds: Math.floor(SESSION_DURATION_MS / 1000),
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.UNIFONIC_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return {
      externalSessionId: response.data.sessionId,
      maskedNumber: response.data.maskedNumber,
    };
  } catch (err) {
    logger.error({ err: err.message, orderId }, 'Unifonic masked session failed');
    throw new IntegrationError('Failed to create masked phone session');
  }
};

const terminateUnifonicSession = async (externalSessionId) => {
  if (STUB_MODE) {
    logger.info({ externalSessionId }, 'Masked phone stub — terminate');
    return true;
  }
  try {
    await axios.delete(
      `${process.env.UNIFONIC_BASE_URL || 'https://api.unifonic.com'}/voice/masked/${externalSessionId}`,
      {
        headers: { Authorization: `Bearer ${process.env.UNIFONIC_API_KEY}` },
        timeout: 10000,
      }
    );
    return true;
  } catch (err) {
    logger.warn({ err: err.message, externalSessionId }, 'Unifonic terminate failed (non-fatal)');
    return false;
  }
};

const createSessionForOrder = async ({ orderId, requesterId }) => {
  const order = await Order.findById(orderId).populate('clientId providerId', 'phone');
  if (!order) throw new NotFoundError('Order');

  const isClient = order.clientId._id.toString() === requesterId.toString();
  const isProvider = order.providerId && order.providerId._id.toString() === requesterId.toString();
  if (!isClient && !isProvider) throw new ForbiddenError('Only order participants can request masked phone');

  const allowedStatuses = ['accepted', 'on_the_way', 'arrived', 'in_progress'];
  if (!allowedStatuses.includes(order.status)) {
    throw new BadRequestError('Masked phone not available for this order status');
  }

  if (!order.providerId) throw new BadRequestError('Order has no assigned provider');

  const existing = await MaskedPhoneSession.findOne({
    orderId,
    status: 'active',
    expiresAt: { $gt: new Date() },
  });

  if (existing) {
    return {
      maskedNumber: existing.maskedNumber,
      expiresAt: existing.expiresAt,
      sessionId: existing._id,
    };
  }

  const clientPhone = order.clientId.phone;
  const providerPhone = order.providerId.phone;

  const remote = await requestUnifonicSession(clientPhone, providerPhone, orderId);

  const session = await MaskedPhoneSession.create({
    orderId,
    clientPhone,
    providerPhone,
    maskedNumber: remote.maskedNumber,
    externalSessionId: remote.externalSessionId,
    expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
  });

  await Order.findByIdAndUpdate(orderId, { maskedPhoneSessionId: session._id });

  return {
    maskedNumber: session.maskedNumber,
    expiresAt: session.expiresAt,
    sessionId: session._id,
  };
};

const terminateSessionForOrder = async (orderId) => {
  const session = await MaskedPhoneSession.findOne({ orderId, status: 'active' });
  if (!session) return;
  await terminateUnifonicSession(session.externalSessionId);
  session.status = 'terminated';
  await session.save();
};

module.exports = { createSessionForOrder, terminateSessionForOrder };
