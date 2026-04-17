const User = require('../models/User');
const { success, paginate } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const walletService = require('../services/wallet.service');
const { cloudinary } = require('../config/cloudinary');
const { NotFoundError, BadRequestError } = require('../errors');

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  return success(res, { user });
});

const updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name', 'email', 'language'];
  const updates = {};
  for (const field of allowed) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  if (updates.email) updates.email = updates.email.toLowerCase();

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  return success(res, { user }, 'Profile updated');
});

const updateAvatar = asyncHandler(async (req, res) => {
  if (!req.file) throw new BadRequestError('No file uploaded');

  if (req.user.avatarId) {
    await cloudinary.uploader.destroy(req.user.avatarId).catch(() => {});
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { avatar: req.file.path, avatarId: req.file.filename },
    { new: true }
  ).select('avatar avatarId');

  return success(res, { avatar: user.avatar }, 'Avatar updated');
});

const addAddress = asyncHandler(async (req, res) => {
  const { label, details, lat, lng, isDefault } = req.body;

  const address = {
    label,
    details: details || '',
    coordinates: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
    isDefault: Boolean(isDefault),
  };

  if (address.isDefault) {
    await User.findByIdAndUpdate(req.user._id, { $set: { 'addresses.$[].isDefault': false } });
  }

  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $push: { addresses: address } },
    { new: true }
  ).select('addresses');

  return success(res, { addresses: user.addresses }, 'Address added', 201);
});

const updateAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const { label, details, lat, lng, isDefault } = req.body;

  const updateFields = {};
  if (label) updateFields['addresses.$.label'] = label;
  if (details !== undefined) updateFields['addresses.$.details'] = details;
  if (lat && lng) {
    updateFields['addresses.$.coordinates'] = {
      type: 'Point',
      coordinates: [parseFloat(lng), parseFloat(lat)],
    };
  }
  if (isDefault !== undefined) updateFields['addresses.$.isDefault'] = Boolean(isDefault);

  const user = await User.findOneAndUpdate(
    { _id: req.user._id, 'addresses._id': addressId },
    { $set: updateFields },
    { new: true }
  ).select('addresses');

  if (!user) throw new NotFoundError('Address');
  return success(res, { addresses: user.addresses }, 'Address updated');
});

const deleteAddress = asyncHandler(async (req, res) => {
  const { addressId } = req.params;
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { $pull: { addresses: { _id: addressId } } },
    { new: true }
  ).select('addresses');

  return success(res, { addresses: user.addresses }, 'Address deleted');
});

const updateDeviceToken = asyncHandler(async (req, res) => {
  const { deviceToken, platform } = req.body;
  if (!deviceToken) throw new BadRequestError('deviceToken is required');

  req.user.addDeviceToken(deviceToken, platform || 'android');
  await req.user.save();

  return success(res, {}, 'Device token updated');
});

const getWalletBalance = asyncHandler(async (req, res) => {
  const role = req.user.role;
  if (role === 'provider') {
    const [balance, debt] = await Promise.all([
      walletService.getProviderBalance(req.user._id),
      walletService.getProviderCommissionDebt(req.user._id),
    ]);
    return success(res, { balance, commissionDebt: debt, currency: 'SAR' });
  }
  const balance = await walletService.getBalance(req.user._id);
  return success(res, { balance, currency: 'SAR' });
});

const getTransactions = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const { items, total } = await walletService.getUserTransactions(req.user._id, {
    page,
    limit,
    type: req.query.type,
  });
  return success(res, { transactions: items }, 'success', 200, paginate(page, limit, total));
});

module.exports = {
  getMe,
  updateMe,
  updateAvatar,
  addAddress,
  updateAddress,
  deleteAddress,
  updateDeviceToken,
  getWalletBalance,
  getTransactions,
};
