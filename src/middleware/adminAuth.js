const { verifyAdminAccessToken } = require('../utils/token');
const Admin = require('../models/Admin');
const { AuthError, ForbiddenError } = require('../errors');
const asyncHandler = require('../utils/asyncHandler');

const protectAdmin = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) throw new AuthError('No token provided');

  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = verifyAdminAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw new AuthError('Token expired');
    throw new AuthError('Invalid token');
  }

  if (decoded.aud !== 'admin') throw new ForbiddenError('Not an admin token');
  if (decoded.mfaPending) throw new ForbiddenError('MFA verification required');

  const admin = await Admin.findById(decoded.adminId);
  if (!admin) throw new AuthError('Admin not found');
  if (admin.status !== 'active') throw new ForbiddenError('Admin suspended');

  req.admin = admin;
  req.user = { _id: admin._id, role: 'admin', isSuperAdmin: admin.isSuperAdmin };
  next();
});

const requirePermission = (permission) => (req, res, next) => {
  if (!req.admin) return next(new AuthError('Admin context missing'));
  if (req.admin.isSuperAdmin) return next();
  if (!req.admin.permissions.includes(permission)) {
    return next(new ForbiddenError(`Permission '${permission}' required`));
  }
  next();
};

module.exports = { protectAdmin, requirePermission };
