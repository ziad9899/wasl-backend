const FraudFlag = require('../models/FraudFlag');
const Bid = require('../models/Bid');
const Order = require('../models/Order');
const logger = require('../utils/logger');

const BID_VELOCITY_MAX_PER_MINUTE = 5;
const BID_VELOCITY_MAX_PER_HOUR = 50;
const LOCATION_MAX_SPEED_KMH = 200;

const distanceKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const checkBidVelocity = async (providerId) => {
  const oneMinAgo = new Date(Date.now() - 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const [perMinute, perHour] = await Promise.all([
    Bid.countDocuments({ providerId, createdAt: { $gte: oneMinAgo } }),
    Bid.countDocuments({ providerId, createdAt: { $gte: oneHourAgo } }),
  ]);

  if (perMinute >= BID_VELOCITY_MAX_PER_MINUTE) {
    await FraudFlag.create({
      userId: providerId,
      signal: 'velocity',
      severity: 'medium',
      details: { perMinute, perHour, limit: BID_VELOCITY_MAX_PER_MINUTE },
    });
    return { blocked: true, reason: 'Bid velocity exceeded (per minute)' };
  }

  if (perHour >= BID_VELOCITY_MAX_PER_HOUR) {
    await FraudFlag.create({
      userId: providerId,
      signal: 'velocity',
      severity: 'high',
      details: { perMinute, perHour, limit: BID_VELOCITY_MAX_PER_HOUR },
    });
    return { blocked: true, reason: 'Bid velocity exceeded (per hour)' };
  }

  return { blocked: false };
};

const checkLocationSanity = async (providerId, newLat, newLng, previousLat, previousLng, previousTimestamp) => {
  if (!previousLat || !previousLng || !previousTimestamp) return { ok: true };
  const secondsElapsed = (Date.now() - new Date(previousTimestamp).getTime()) / 1000;
  if (secondsElapsed < 5) return { ok: true };

  const km = distanceKm(previousLat, previousLng, newLat, newLng);
  const speedKmH = (km / secondsElapsed) * 3600;

  if (speedKmH > LOCATION_MAX_SPEED_KMH) {
    await FraudFlag.create({
      userId: providerId,
      signal: 'location_spoof',
      severity: 'high',
      details: { km, secondsElapsed, speedKmH, from: [previousLng, previousLat], to: [newLng, newLat] },
    });
    logger.warn({ providerId, speedKmH }, 'Location spoofing detected');
    return { ok: false, reason: 'Implausible speed' };
  }
  return { ok: true };
};

const checkCancellationRate = async (providerId) => {
  const agg = await Order.aggregate([
    { $match: { providerId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
      },
    },
  ]);

  if (!agg.length || agg[0].total < 10) return { ok: true };

  const rate = agg[0].cancelled / agg[0].total;
  if (rate > 0.3) {
    await FraudFlag.create({
      userId: providerId,
      signal: 'cancellation_spike',
      severity: 'medium',
      details: { total: agg[0].total, cancelled: agg[0].cancelled, rate },
    });
    return { ok: false, rate };
  }
  return { ok: true, rate };
};

module.exports = { checkBidVelocity, checkLocationSanity, checkCancellationRate };
