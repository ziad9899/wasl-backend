const { createReview } = require('../services/review.service');
const Order = require('../models/Order');
const Review = require('../models/Review');
const { success, paginate } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../errors');
const { ORDER_STATUS } = require('../constants');

const submitReview = asyncHandler(async (req, res) => {
  const { orderId, rating, comment } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw new NotFoundError('Order');
  if (order.status !== ORDER_STATUS.COMPLETED) throw new BadRequestError('Order not completed yet');

  const isClient = order.clientId.toString() === req.user._id.toString();
  const isProvider = order.providerId?.toString() === req.user._id.toString();
  if (!isClient && !isProvider) throw new ForbiddenError('Access denied');

  const role = isClient ? 'client_to_provider' : 'provider_to_client';
  const toUser = isClient ? order.providerId : order.clientId;

  const review = await createReview({
    orderId,
    fromUser: req.user._id,
    toUser,
    role,
    rating,
    comment: comment || '',
  });

  return success(res, { review }, 'Review submitted', 201);
});

const getUserReviews = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const skip = (page - 1) * limit;

  const filter = {
    toUser: userId,
    role: 'client_to_provider',
    isVisibleToPublic: true,
    isDeletedByAdmin: false,
  };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('fromUser', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return success(res, { reviews }, 'success', 200, paginate(page, limit, total));
});

module.exports = { submitReview, getUserReviews };
