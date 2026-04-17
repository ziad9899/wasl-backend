const mongoose = require('mongoose');
const Provider = require('../models/Provider');
const Order = require('../models/Order');
const Config = require('../models/Config');
const BroadcastAttempt = require('../models/BroadcastAttempt');
const fcmService = require('./fcm.service');
const logger = require('../utils/logger');
const {
  ORDER_STATUS,
  FIXED_PRICE_CATEGORIES,
  CONFIG_KEYS,
  NOTIFICATION_TYPES,
} = require('../constants');

const pendingTimers = new Map();

const findNearbyProviders = async (serviceCategory, coordinates, excludeIds = []) => {
  const radiusKm = (await Config.get(CONFIG_KEYS.SERVICE_RADIUS)) || 10;
  const excludeObjectIds = excludeIds
    .filter((id) => id)
    .map((id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)));

  const providers = await Provider.aggregate([
    {
      $geoNear: {
        near: { type: 'Point', coordinates },
        distanceField: 'distance',
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: {
          approvalStatus: 'approved',
          isOnline: true,
          specialty: serviceCategory,
          userId: { $nin: excludeObjectIds },
        },
      },
    },
    { $sort: { distance: 1 } },
    { $limit: 50 },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user',
      },
    },
    { $unwind: '$user' },
    { $match: { 'user.status': 'active' } },
  ]);

  return providers;
};

const emitToProvider = (io, providerId, payload) => {
  if (!io) return;
  io.to(`user:${providerId}`).emit('order:new_request', payload);
};

const emitToClient = (io, clientId, event, payload) => {
  if (!io) return;
  io.to(`user:${clientId}`).emit(event, payload);
};

const markOrderCancelledNoProviders = async (orderId, io) => {
  const order = await Order.findByIdAndUpdate(
    orderId,
    { status: ORDER_STATUS.NO_PROVIDERS },
    { new: true }
  );
  if (order) {
    emitToClient(io, order.clientId, 'order:no_providers', { orderId });
    await fcmService.sendToUser(order.clientId, NOTIFICATION_TYPES.ORDER_REJECTED, {
      orderId: orderId.toString(),
    });
  }
};

const broadcastFixed = async (order, io) => {
  const maxAttempts = (await Config.get(CONFIG_KEYS.MAX_BROADCAST_ATTEMPTS)) || 5;
  const timeoutSeconds = (await Config.get(CONFIG_KEYS.ORDER_ACCEPTANCE_WINDOW)) || 60;

  const fresh = await Order.findById(order._id);
  if (!fresh || [ORDER_STATUS.ACCEPTED, ORDER_STATUS.CANCELLED, ORDER_STATUS.NO_PROVIDERS].includes(fresh.status)) {
    return null;
  }

  if (fresh.broadcastAttemptCount >= maxAttempts) {
    await markOrderCancelledNoProviders(fresh._id, io);
    return null;
  }

  const excludeIds = fresh.rejectedBy.map((id) => id.toString());
  const providers = await findNearbyProviders(fresh.serviceCategory, fresh.location.coordinates, excludeIds);

  if (!providers.length) {
    await markOrderCancelledNoProviders(fresh._id, io);
    return null;
  }

  const provider = providers[0];
  const providerId = provider.userId._id || provider.userId;
  const attemptNumber = fresh.broadcastAttemptCount + 1;

  await Order.findByIdAndUpdate(fresh._id, {
    status: ORDER_STATUS.BROADCASTING,
    $addToSet: { broadcastedTo: providerId },
    broadcastAttemptCount: attemptNumber,
  });

  await BroadcastAttempt.create({
    orderId: fresh._id,
    attemptNumber,
    strategy: 'fixed_sequential',
    providersNotified: [providerId],
    startedAt: new Date(),
  });

  emitToProvider(io, providerId, {
    orderId: fresh._id,
    orderNumber: fresh.orderNumber,
    serviceCategory: fresh.serviceCategory,
    serviceDetails: fresh.serviceDetails,
    location: fresh.location,
    agreedPrice: fresh.agreedPrice,
    distance: provider.distance,
    timeoutSeconds,
  });

  await fcmService.sendToUser(providerId, NOTIFICATION_TYPES.ORDER_NEW, {
    orderId: fresh._id.toString(),
  });

  scheduleTimeout(fresh._id.toString(), timeoutSeconds * 1000, io);

  return providerId;
};

const scheduleTimeout = (orderId, delayMs, io) => {
  cancelTimeout(orderId);
  const timer = setTimeout(async () => {
    pendingTimers.delete(orderId);
    try {
      const order = await Order.findById(orderId);
      if (!order || order.status !== ORDER_STATUS.BROADCASTING) return;

      const lastProviderId = order.broadcastedTo[order.broadcastedTo.length - 1];
      if (lastProviderId) {
        await Order.findByIdAndUpdate(orderId, { $addToSet: { rejectedBy: lastProviderId } });
      }
      const refreshed = await Order.findById(orderId);
      await broadcastFixed(refreshed, io);
    } catch (err) {
      logger.error({ err: err.message, orderId }, 'Broadcast timeout handler failed');
    }
  }, delayMs);
  pendingTimers.set(orderId, timer);
};

const cancelTimeout = (orderId) => {
  const timer = pendingTimers.get(orderId);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(orderId);
  }
};

const broadcastBid = async (order, io) => {
  const fresh = await Order.findById(order._id);
  if (!fresh || fresh.status !== ORDER_STATUS.PENDING) return [];

  const providers = await findNearbyProviders(fresh.serviceCategory, fresh.location.coordinates);

  if (!providers.length) {
    await markOrderCancelledNoProviders(fresh._id, io);
    return [];
  }

  const providerIds = providers.map((p) => p.userId._id || p.userId);
  const bidExpiryMinutes = (await Config.get(CONFIG_KEYS.BID_EXPIRY_MINUTES)) || 10;

  await Order.findByIdAndUpdate(fresh._id, {
    status: ORDER_STATUS.BROADCASTING,
    broadcastedTo: providerIds,
    broadcastAttemptCount: 1,
    expiresAt: new Date(Date.now() + bidExpiryMinutes * 60 * 1000),
  });

  await BroadcastAttempt.create({
    orderId: fresh._id,
    attemptNumber: 1,
    strategy: 'bid_fanout',
    providersNotified: providerIds,
    startedAt: new Date(),
  });

  for (const provider of providers) {
    const providerId = provider.userId._id || provider.userId;
    emitToProvider(io, providerId, {
      orderId: fresh._id,
      orderNumber: fresh.orderNumber,
      serviceCategory: fresh.serviceCategory,
      serviceDetails: fresh.serviceDetails,
      location: fresh.location,
      distance: provider.distance,
      pricingType: 'bid',
      bidExpiryMinutes,
    });
  }

  await fcmService.sendToMany(
    providerIds.map((id) => id.toString()),
    NOTIFICATION_TYPES.ORDER_NEW,
    { orderId: fresh._id.toString() }
  );

  return providerIds;
};

const broadcast = async (order, io) => {
  try {
    if (FIXED_PRICE_CATEGORIES.includes(order.serviceCategory)) {
      return await broadcastFixed(order, io);
    }
    return await broadcastBid(order, io);
  } catch (err) {
    logger.error({ err: err.message, orderId: order?._id?.toString() }, 'Broadcast failed');
  }
};

const restoreBroadcastsOnBoot = async (io) => {
  const stuck = await Order.find({ status: ORDER_STATUS.BROADCASTING });
  for (const order of stuck) {
    const timeoutSeconds = (await Config.get(CONFIG_KEYS.ORDER_ACCEPTANCE_WINDOW)) || 60;
    if (FIXED_PRICE_CATEGORIES.includes(order.serviceCategory)) {
      scheduleTimeout(order._id.toString(), timeoutSeconds * 1000, io);
    }
  }
  logger.info(`Restored ${stuck.length} in-flight broadcasts`);
};

module.exports = {
  broadcast,
  findNearbyProviders,
  cancelTimeout,
  restoreBroadcastsOnBoot,
  FIXED_PRICE_SERVICES: FIXED_PRICE_CATEGORIES,
};
