const User = require('../models/User');
const Provider = require('../models/Provider');
const Review = require('../models/Review');
const { success, paginate } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const fraudService = require('../services/fraud.service');
const { NotFoundError, ConflictError, ForbiddenError, BadRequestError } = require('../errors');
const { USER_ROLES, USER_STATUS, PROVIDER_APPROVAL } = require('../constants');

const registerProvider = asyncHandler(async (req, res) => {
  const { specialty, vehicle, bankInfo, serviceRadius, subCategories } = req.body;

  const existing = await Provider.findOne({ userId: req.user._id });
  if (existing) throw new ConflictError('Provider profile already exists');

  if (bankInfo?.iban && !/^SA\d{22}$/.test(bankInfo.iban)) {
    throw new BadRequestError('Invalid Saudi IBAN format');
  }

  const provider = await Provider.create({
    userId: req.user._id,
    specialty: Array.isArray(specialty) ? specialty : [specialty],
    subCategories: subCategories || [],
    vehicle: vehicle || {},
    bankInfo: bankInfo || {},
    serviceRadius: serviceRadius || 10,
  });

  await User.findByIdAndUpdate(req.user._id, {
    role: USER_ROLES.PROVIDER,
    status: USER_STATUS.AWAITING_APPROVAL,
  });

  return success(res, { provider }, 'Provider registered. Awaiting approval', 201);
});

const uploadDocument = asyncHandler(async (req, res) => {
  if (!req.file) throw new BadRequestError('No file uploaded');
  const { docType, side } = req.body;
  const allowedTypes = [
    'nationalId_front', 'nationalId_back',
    'residencePermit_front', 'residencePermit_back',
    'drivingLicense', 'profilePhoto', 'professionCard',
  ];
  const fieldKey = side ? `${docType}_${side}` : docType;
  if (!allowedTypes.includes(fieldKey)) throw new BadRequestError('Invalid document type');

  const updatePath = side ? `documents.${docType}.${side}` : `documents.${docType}`;

  const provider = await Provider.findOneAndUpdate(
    { userId: req.user._id },
    {
      $set: {
        [`${updatePath}.url`]: req.file.path,
        [`${updatePath}.publicId`]: req.file.filename,
        [`${updatePath}.uploadedAt`]: new Date(),
        [`${updatePath}.verified`]: false,
      },
    },
    { new: true }
  );

  if (!provider) throw new NotFoundError('Provider profile');
  return success(res, { documents: provider.documents }, 'Document uploaded');
});

const getMyProfile = asyncHandler(async (req, res) => {
  const provider = await Provider.findOne({ userId: req.user._id })
    .populate('userId', 'name phone email avatar rating');
  if (!provider) throw new NotFoundError('Provider profile');
  return success(res, { provider });
});

const updateProfile = asyncHandler(async (req, res) => {
  const allowed = ['vehicle', 'serviceRadius', 'subCategories'];
  const updates = {};
  allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

  if (req.body.specialty) {
    updates.specialty = Array.isArray(req.body.specialty) ? req.body.specialty : [req.body.specialty];
  }

  if (req.body.bankInfo) {
    if (req.body.bankInfo.iban && !/^SA\d{22}$/.test(req.body.bankInfo.iban)) {
      throw new BadRequestError('Invalid Saudi IBAN format');
    }
    updates.bankInfo = req.body.bankInfo;
  }

  const provider = await Provider.findOneAndUpdate(
    { userId: req.user._id },
    updates,
    { new: true, runValidators: true }
  );
  if (!provider) throw new NotFoundError('Provider profile');
  return success(res, { provider }, 'Profile updated');
});

const setOnlineStatus = asyncHandler(async (req, res) => {
  const { isOnline } = req.body;
  const provider = await Provider.findOne({ userId: req.user._id });
  if (!provider) throw new NotFoundError('Provider profile');
  if (provider.approvalStatus !== PROVIDER_APPROVAL.APPROVED) throw new ForbiddenError('Account not approved yet');

  await Provider.findOneAndUpdate(
    { userId: req.user._id },
    { isOnline: Boolean(isOnline), lastOnlineAt: new Date() }
  );

  return success(res, { isOnline: Boolean(isOnline) }, 'Status updated');
});

const updateLocation = asyncHandler(async (req, res) => {
  const { lat, lng } = req.body;

  const existingProvider = await Provider.findOne({ userId: req.user._id }).select('currentLocation locationUpdatedAt');

  if (existingProvider?.locationUpdatedAt) {
    const prevCoords = existingProvider.currentLocation?.coordinates || [0, 0];
    await fraudService.checkLocationSanity(
      req.user._id,
      parseFloat(lat),
      parseFloat(lng),
      prevCoords[1],
      prevCoords[0],
      existingProvider.locationUpdatedAt
    );
  }

  await Provider.findOneAndUpdate(
    { userId: req.user._id },
    {
      currentLocation: {
        type: 'Point',
        coordinates: [parseFloat(lng), parseFloat(lat)],
      },
      locationUpdatedAt: new Date(),
    }
  );

  await User.findByIdAndUpdate(req.user._id, {
    currentLocation: {
      type: 'Point',
      coordinates: [parseFloat(lng), parseFloat(lat)],
    },
  });

  return success(res, {}, 'Location updated');
});

const getProviderReviews = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const skip = (page - 1) * limit;

  const filter = {
    toUser: id,
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

// Marks the provider's application as submitted-for-review. Until this
// fires, the provider sits in "draft" state — visible only to themselves
// (their requirements screen lets them keep editing) and NOT in the admin
// pending queue. After this fires, approvalStatus stays 'pending' but
// submittedAt becomes a timestamp, which is what the app and admin both
// use to know "review me now".
//
// Idempotent: calling it again is a no-op (we don't refresh the timestamp
// or change anything if already submitted, so admin queue order is stable).
const submitProviderApplication = asyncHandler(async (req, res) => {
  const provider = await Provider.findOne({ userId: req.user._id });
  if (!provider) throw new NotFoundError('Provider profile');

  // Once approved or rejected, the application is closed.
  if (provider.approvalStatus !== 'pending') {
    throw new ConflictError('Application already processed');
  }

  // Don't accept submission without at least the two mandatory documents
  // (national ID front + selfie). The screen can show a clearer error.
  const docs = provider.documents || {};
  const hasIdFront = !!(docs.nationalId?.front?.url || docs.residencePermit?.front?.url);
  const hasSelfie = !!docs.profilePhoto?.url;
  if (!hasIdFront || !hasSelfie) {
    throw new BadRequestError('Required documents missing: id and profile photo');
  }

  if (provider.submittedAt) {
    return success(res, { submittedAt: provider.submittedAt }, 'Already submitted');
  }

  provider.submittedAt = new Date();
  await provider.save();
  return success(res, { submittedAt: provider.submittedAt }, 'Application submitted');
});

const getPublicProvider = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('name avatar rating role status');
  if (!user || user.role !== 'provider') throw new NotFoundError('Provider');

  const provider = await Provider.findOne({ userId: req.params.id })
    .select('specialty completedOrders avgRating ratingCount')
    .lean();

  return success(res, {
    provider: {
      _id: user._id,
      name: user.name,
      avatar: user.avatar,
      rating: user.rating,
      specialty: provider?.specialty || [],
      completedOrders: provider?.completedOrders || 0,
    },
  });
});

module.exports = {
  registerProvider,
  uploadDocument,
  getMyProfile,
  updateProfile,
  setOnlineStatus,
  updateLocation,
  submitProviderApplication,
  getProviderReviews,
  getPublicProvider,
};
