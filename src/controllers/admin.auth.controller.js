const argon2 = require('argon2');
const Admin = require('../models/Admin');
const auditService = require('../services/audit.service');
const {
  generateAdminAccessToken,
  generateAdminRefreshToken,
  verifyAdminRefreshToken,
} = require('../utils/token');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { AuthError, ForbiddenError, BadRequestError } = require('../errors');

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const admin = await Admin.findOne({ email: email.toLowerCase() }).select(
    '+passwordHash +mfaSecret name email mfaEnabled permissions isSuperAdmin status lockedUntil failedLoginCount'
  );

  if (!admin) throw new AuthError('Invalid credentials');

  if (admin.status === 'suspended') throw new ForbiddenError('Admin account suspended');

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    const remaining = Math.ceil((admin.lockedUntil - Date.now()) / 1000 / 60);
    throw new ForbiddenError(`Account locked. Try again in ${remaining} minutes`);
  }

  let valid = false;
  try {
    valid = await argon2.verify(admin.passwordHash, password);
  } catch (err) {
    valid = false;
  }

  if (!valid) {
    const attempts = (admin.failedLoginCount || 0) + 1;
    const update = { failedLoginCount: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      update.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      update.failedLoginCount = 0;
    }
    await Admin.findByIdAndUpdate(admin._id, update);
    throw new AuthError('Invalid credentials');
  }

  await Admin.findByIdAndUpdate(admin._id, {
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: new Date(),
    lastLoginIp: req.ip,
  });

  if (admin.mfaEnabled) {
    const mfaToken = generateAdminAccessToken({
      adminId: admin._id,
      mfaPending: true,
      role: 'admin',
    }, '5m');

    return success(res, {
      mfaRequired: true,
      mfaToken,
    }, 'MFA verification required');
  }

  const accessToken = generateAdminAccessToken({
    adminId: admin._id,
    role: 'admin',
    isSuperAdmin: admin.isSuperAdmin,
    permissions: admin.permissions,
  });
  const refreshToken = generateAdminRefreshToken({ adminId: admin._id });

  await auditService.record({
    actorType: 'admin',
    actorId: admin._id,
    action: 'admin.login',
    targetType: 'Admin',
    targetId: admin._id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] || '',
    correlationId: req.correlationId,
  });

  return success(res, {
    accessToken,
    refreshToken,
    admin: {
      _id: admin._id,
      name: admin.name,
      email: admin.email,
      permissions: admin.permissions,
      isSuperAdmin: admin.isSuperAdmin,
    },
  }, 'Login successful');
});

const verifyMfa = asyncHandler(async (req, res) => {
  throw new BadRequestError('MFA not yet enabled in this build');
});

const refresh = asyncHandler(async (req, res) => {
  const { refreshToken: token } = req.body;
  if (!token) throw new BadRequestError('Refresh token required');

  let decoded;
  try {
    decoded = verifyAdminRefreshToken(token);
  } catch (err) {
    throw new AuthError('Invalid refresh token');
  }

  const admin = await Admin.findById(decoded.adminId);
  if (!admin || admin.status !== 'active') throw new AuthError('Admin not found or inactive');

  const accessToken = generateAdminAccessToken({
    adminId: admin._id,
    role: 'admin',
    isSuperAdmin: admin.isSuperAdmin,
    permissions: admin.permissions,
  });
  const newRefresh = generateAdminRefreshToken({ adminId: admin._id });

  return success(res, { accessToken, refreshToken: newRefresh });
});

const logout = asyncHandler(async (req, res) => {
  await auditService.record({
    actorType: 'admin',
    actorId: req.admin?._id,
    action: 'admin.logout',
    targetType: 'Admin',
    targetId: req.admin?._id,
    ipAddress: req.ip,
    correlationId: req.correlationId,
  });
  return success(res, {}, 'Logged out');
});

const me = asyncHandler(async (req, res) => {
  return success(res, {
    admin: {
      _id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email,
      permissions: req.admin.permissions,
      isSuperAdmin: req.admin.isSuperAdmin,
    },
  });
});

module.exports = { login, verifyMfa, refresh, logout, me };
