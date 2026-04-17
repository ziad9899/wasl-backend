const Referral = require('../models/Referral');
const User = require('../models/User');
const Config = require('../models/Config');
const ledger = require('./ledger.service');
const logger = require('../utils/logger');
const { CONFIG_KEYS } = require('../constants');
const { NotFoundError, ConflictError } = require('../errors');

const registerReferral = async ({ refereeId, code }) => {
  if (!code) return null;

  const referrer = await User.findOne({ referralCode: code.toUpperCase() });
  if (!referrer) return null;
  if (referrer._id.equals(refereeId)) return null;

  const existing = await Referral.findOne({ refereeId });
  if (existing) return existing;

  const referral = await Referral.create({
    referrerId: referrer._id,
    refereeId,
    code: code.toUpperCase(),
    status: 'registered',
  });

  await User.findByIdAndUpdate(refereeId, { referredBy: referrer._id });

  return referral;
};

const markQualifiedOnOrderCompletion = async (orderId, clientId) => {
  const referral = await Referral.findOne({ refereeId: clientId, status: 'registered' });
  if (!referral) return null;

  referral.status = 'qualified';
  referral.firstOrderId = orderId;
  await referral.save();

  await rewardReferrer(referral._id);
  return referral;
};

const rewardReferrer = async (referralId) => {
  const referral = await Referral.findById(referralId);
  if (!referral || referral.status !== 'qualified') return;

  const bonus = (await Config.get(CONFIG_KEYS.REFERRAL_BONUS)) || 0;
  if (bonus <= 0) {
    referral.status = 'rewarded';
    referral.bonusAmount = 0;
    referral.rewardedAt = new Date();
    await referral.save();
    return referral;
  }

  try {
    await ledger.applyReferralBonus({
      referrerId: referral.referrerId,
      amountHalalas: bonus,
      idempotencyKey: `referral:${referral._id}`,
    });

    referral.status = 'rewarded';
    referral.bonusAmount = bonus;
    referral.rewardedAt = new Date();
    await referral.save();
    return referral;
  } catch (err) {
    logger.error({ err: err.message, referralId }, 'Referral bonus payment failed');
    throw err;
  }
};

const getStats = async (userId) => {
  const referrals = await Referral.find({ referrerId: userId }).sort({ createdAt: -1 });
  const totalRewards = referrals
    .filter((r) => r.status === 'rewarded')
    .reduce((sum, r) => sum + r.bonusAmount, 0);

  return {
    totalReferrals: referrals.length,
    qualifiedCount: referrals.filter((r) => ['qualified', 'rewarded'].includes(r.status)).length,
    rewardedCount: referrals.filter((r) => r.status === 'rewarded').length,
    totalRewardsHalalas: totalRewards,
  };
};

module.exports = { registerReferral, markQualifiedOnOrderCompletion, rewardReferrer, getStats };
