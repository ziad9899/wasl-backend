const mongoose = require('mongoose');
const Review   = require('../models/Review');
const User     = require('../models/User');
const Provider = require('../models/Provider');
const Config   = require('../models/Config');
const logger   = require('../utils/logger');

const MIN_RATING_THRESHOLD = 2;

const createReview = async ({ orderId, fromUser, toUser, role, rating, comment }) => {
  const existing = await Review.findOne({ orderId, fromUser, role });
  if (existing) {
    throw Object.assign(new Error('Review already submitted for this order'), {
      statusCode: 409,
    });
  }

  const isPublic = role === 'client_to_provider';

  const review = await Review.create({
    orderId,
    fromUser,
    toUser,
    role,
    rating,
    comment,
    isVisibleToPublic: isPublic,
  });

  await recalculateRating(toUser);

  if (role === 'client_to_provider') {
    await checkAutoSuspend(toUser);
  }

  return review;
};

const recalculateRating = async (userId) => {
  const result = await Review.aggregate([
    {
      $match: {
        toUser:            new mongoose.Types.ObjectId(userId),
        role:              'client_to_provider',
        isDeleted:         false,
        isVisibleToPublic: true,
      },
    },
    {
      $group: {
        _id:     null,
        average: { $avg: '$rating' },
        count:   { $sum: 1 },
      },
    },
  ]);

  if (result.length) {
    const { average, count } = result[0];
    await User.findByIdAndUpdate(userId, {
      'rating.average': parseFloat(average.toFixed(2)),
      'rating.count':   count,
    });
    return { average, count };
  }

  return { average: 0, count: 0 };
};

const checkAutoSuspend = async (userId) => {
  try {
    const minRating = await Config.get('minRatingThreshold') || MIN_RATING_THRESHOLD;
    const user      = await User.findById(userId).select('rating status');

    if (!user || user.status !== 'active') return;

    if (user.rating.count >= 5 && user.rating.average < minRating) {
      await User.findByIdAndUpdate(userId,       { status: 'suspended' });
      await Provider.findOneAndUpdate({ userId }, { autoSuspended: true });

      logger.warn(`Provider ${userId} auto-suspended. Rating: ${user.rating.average}`);
    }
  } catch (err) {
    logger.error('checkAutoSuspend error:', err.message);
  }
};

module.exports = { createReview, recalculateRating };