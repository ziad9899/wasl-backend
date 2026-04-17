const User = require('../models/User');
const otpService = require('../services/otp.service');
const referralService = require('../services/referral.service');
const auditService = require('../services/audit.service');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/token');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { normalizeSaudiPhone } = require('../utils/phone');
const { BadRequestError, AuthError, ForbiddenError } = require('../errors');
const { USER_STATUS, USER_ROLES } = require('../constants');

const sendOtpHandler = asyncHandler(async (req, res) => {
  const { phone } = req.body;
  const result = await otpService.sendOtp(phone, { ip: req.ip });
  return success(res, result, 'OTP sent');
});

const verifyOtpHandler = asyncHandler(async (req, res) => {
  const { phone: rawPhone, code, deviceToken, devicePlatform } = req.body;
  const { phone } = await otpService.verifyOtp(rawPhone, code);

  let user = await User.findOne({ phone });
  let isNew = false;

  if (!user) {
    user = await User.create({ phone, isVerified: true, status: USER_STATUS.PENDING_PROFILE });
    isNew = true;
  } else {
    user.isVerified = true;
    user.lastSeenAt = new Date();
    if (deviceToken) user.addDeviceToken(deviceToken, devicePlatform);
    await user.save();
  }

  if (user.status === USER_STATUS.SUSPENDED) {
    throw new ForbiddenError('Account suspended');
  }

  const payload = { userId: user._id, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  return success(
    res,
    {
      accessToken,
      refreshToken,
      isNew,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
        status: user.status,
        avatar: user.avatar,
        isVerified: user.isVerified,
        language: user.language,
        referralCode: user.referralCode,
      },
    },
    isNew ? 'Registration successful' : 'Login successful',
    isNew ? 201 : 200
  );
});

const completeRegistration = asyncHandler(async (req, res) => {
  const { name, email, role, language, referralCode, consentPdpl, consentMarketing } = req.body;
  const user = req.user;

  if (consentPdpl !== true) throw new BadRequestError('PDPL consent is required');

  if (name) user.name = name;
  if (email) user.email = email.toLowerCase();
  if (language) user.language = language;
  if (role && [USER_ROLES.CLIENT, USER_ROLES.PROVIDER].includes(role)) {
    user.role = role;
  }

  user.consentPdplAt = new Date();
  if (consentMarketing === true) user.consentMarketingAt = new Date();

  if (user.status === USER_STATUS.PENDING_PROFILE) {
    user.status = role === USER_ROLES.PROVIDER ? USER_STATUS.AWAITING_APPROVAL : USER_STATUS.ACTIVE;
  }

  await user.save();

  if (referralCode) {
    await referralService.registerReferral({ refereeId: user._id, code: referralCode });
  }

  await auditService.record({
    actorType: 'user',
    actorId: user._id,
    action: 'auth.complete_profile',
    targetType: 'User',
    targetId: user._id,
    ipAddress: req.ip,
    correlationId: req.correlationId,
  });

  return success(res, {
    user: {
      _id: user._id,
      name: user.name,
      phone: user.phone,
      email: user.email,
      role: user.role,
      status: user.status,
      language: user.language,
      avatar: user.avatar,
      referralCode: user.referralCode,
    },
  }, 'Profile completed');
});

const refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) throw new BadRequestError('Refresh token required');

  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new AuthError('Refresh token expired');
    throw new AuthError('Invalid refresh token');
  }

  const user = await User.findById(decoded.userId).select('role status');
  if (!user) throw new AuthError('User not found');
  if (user.status === USER_STATUS.SUSPENDED) throw new ForbiddenError('Account suspended');

  const payload = { userId: user._id, role: user.role };
  const accessToken = generateAccessToken(payload);
  const newRefresh = generateRefreshToken(payload);

  return success(res, { accessToken, refreshToken: newRefresh }, 'Token refreshed');
});

const logout = asyncHandler(async (req, res) => {
  const { deviceToken } = req.body;
  if (deviceToken) {
    req.user.removeDeviceToken(deviceToken);
    await req.user.save();
  }
  return success(res, {}, 'Logged out successfully');
});

module.exports = {
  sendOtpHandler,
  verifyOtpHandler,
  completeRegistration,
  refreshToken,
  logout,
};
