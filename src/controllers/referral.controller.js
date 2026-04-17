const User = require('../models/User');
const Referral = require('../models/Referral');
const referralService = require('../services/referral.service');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { ConflictError, NotFoundError } = require('../errors');

const getMyCode = asyncHandler(async (req, res) => {
  const stats = await referralService.getStats(req.user._id);
  return success(res, {
    referralCode: req.user.referralCode,
    ...stats,
  });
});

const getMyReferrals = asyncHandler(async (req, res) => {
  const list = await Referral.find({ referrerId: req.user._id })
    .populate('refereeId', 'name phone')
    .sort({ createdAt: -1 })
    .lean();
  return success(res, { referrals: list });
});

const redeem = asyncHandler(async (req, res) => {
  const { code } = req.body;

  const existing = await Referral.findOne({ refereeId: req.user._id });
  if (existing) throw new ConflictError('Referral already redeemed');

  if (req.user.referredBy) throw new ConflictError('Already referred by someone');

  const referral = await referralService.registerReferral({
    refereeId: req.user._id,
    code,
  });

  if (!referral) throw new NotFoundError('Referral code');

  return success(res, { referral }, 'Referral redeemed', 201);
});

module.exports = { getMyCode, getMyReferrals, redeem };
