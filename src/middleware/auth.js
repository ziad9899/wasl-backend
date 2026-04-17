const { verifyAccessToken } = require('../utils/token');
const User = require('../models/User');
const Admin = require('../models/Admin');
const { AuthError, ForbiddenError } = require('../errors');
const asyncHandler = require('../utils/asyncHandler');
const { USER_STATUS } = require('../constants');

const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) throw new AuthError('No token provided');

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new AuthError('Token expired');
    throw new AuthError('Invalid token');
  }

  if (decoded.aud === 'admin') {
    const admin = await Admin.findById(decoded.adminId);
    if (!admin) throw new AuthError('Admin not found');
    if (admin.status !== 'active') throw new ForbiddenError('Admin suspended');
    req.admin = admin;
    req.user = { _id: admin._id, role: 'admin', isSuperAdmin: admin.isSuperAdmin };
    return next();
  }

  const user = await User.findById(decoded.userId).select(
    'name phone email role status language deviceTokens rating avatar referralCode referredBy'
  );

  if (!user) throw new AuthError('User not found');
  if (user.status === USER_STATUS.SUSPENDED) throw new ForbiddenError('Account suspended');

  req.user = user;
  next();
});

const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return next(new ForbiddenError('Access denied'));
  next();
};

const requireActiveUser = (req, res, next) => {
  if (req.user.role === 'admin') return next();
  if (req.user.status !== USER_STATUS.ACTIVE) {
    return next(new ForbiddenError('Account not active yet'));
  }
  next();
};

const optionalAuth = asyncHandler(async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    const user = await User.findById(decoded.userId).select('name phone email role status language');
    if (user && user.status === USER_STATUS.ACTIVE) req.user = user;
  } catch (_) {}
  next();
});

module.exports = { protect, restrictTo, requireActiveUser, optionalAuth };
