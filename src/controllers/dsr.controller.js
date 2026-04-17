const DSRRequest = require('../models/DSRRequest');
const User = require('../models/User');
const Order = require('../models/Order');
const otpService = require('../services/otp.service');
const auditService = require('../services/audit.service');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { DSR_TYPES, DSR_STATUS } = require('../constants');
const { ConflictError, BadRequestError } = require('../errors');

const GRACE_DAYS = 30;

const requestExport = asyncHandler(async (req, res) => {
  const recent = await DSRRequest.findOne({
    userId: req.user._id,
    type: DSR_TYPES.EXPORT,
    createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  });
  if (recent) throw new ConflictError('Export already requested within the last 30 days');

  const dsr = await DSRRequest.create({
    userId: req.user._id,
    type: DSR_TYPES.EXPORT,
    status: DSR_STATUS.RECEIVED,
    reason: req.body.reason || '',
  });

  await auditService.record({
    actorType: 'user',
    actorId: req.user._id,
    action: 'dsr.export_request',
    targetType: 'DSRRequest',
    targetId: dsr._id,
    ipAddress: req.ip,
    correlationId: req.correlationId,
  });

  return res.status(202).json({
    success: true,
    message: 'Export request received. You will be notified when ready.',
    data: { dsrId: dsr._id, status: dsr.status },
  });
});

const requestErasure = asyncHandler(async (req, res) => {
  const { otpCode } = req.body;
  if (!otpCode) throw new BadRequestError('OTP is required for erasure confirmation');

  await otpService.verifyOtp(req.user.phone, otpCode, { purpose: 'erasure_confirm' });

  const existing = await DSRRequest.findOne({
    userId: req.user._id,
    type: DSR_TYPES.ERASURE,
    status: { $in: [DSR_STATUS.RECEIVED, DSR_STATUS.PROCESSING] },
  });
  if (existing) throw new ConflictError('Erasure already pending');

  const graceEnd = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);

  const dsr = await DSRRequest.create({
    userId: req.user._id,
    type: DSR_TYPES.ERASURE,
    status: DSR_STATUS.PROCESSING,
    gracePeriodEndsAt: graceEnd,
    reason: req.body.reason || '',
  });

  await auditService.record({
    actorType: 'user',
    actorId: req.user._id,
    action: 'dsr.erasure_request',
    targetType: 'DSRRequest',
    targetId: dsr._id,
    ipAddress: req.ip,
    correlationId: req.correlationId,
  });

  return res.status(202).json({
    success: true,
    message: `Erasure scheduled. You can cancel within ${GRACE_DAYS} days.`,
    data: { dsrId: dsr._id, gracePeriodEndsAt: graceEnd },
  });
});

const cancelErasure = asyncHandler(async (req, res) => {
  const dsr = await DSRRequest.findOne({
    userId: req.user._id,
    type: DSR_TYPES.ERASURE,
    status: DSR_STATUS.PROCESSING,
  });
  if (!dsr) throw new BadRequestError('No pending erasure to cancel');

  dsr.status = DSR_STATUS.REJECTED;
  dsr.rejectionReason = 'Cancelled by user within grace period';
  dsr.completedAt = new Date();
  await dsr.save();

  return success(res, { dsrId: dsr._id }, 'Erasure cancelled');
});

const updateConsent = asyncHandler(async (req, res) => {
  const { marketing } = req.body;
  const updates = {};
  if (typeof marketing === 'boolean') {
    updates.consentMarketingAt = marketing ? new Date() : null;
  }
  const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select(
    'consentMarketingAt consentPdplAt'
  );
  return success(res, { consents: user });
});

const listMyRequests = asyncHandler(async (req, res) => {
  const list = await DSRRequest.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  return success(res, { requests: list });
});

module.exports = { requestExport, requestErasure, cancelErasure, updateConsent, listMyRequests };
