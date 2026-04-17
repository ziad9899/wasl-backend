const ServiceSubCategory = require('../models/ServiceSubCategory');
const CarWashPrice = require('../models/CarWashPrice');
const Banner = require('../models/Banner');
const Config = require('../models/Config');
const { SERVICE_CATEGORIES } = require('../constants');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const getBanners = asyncHandler(async (req, res) => {
  const now = new Date();
  const banners = await Banner.find({
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    ],
  })
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();

  const lang = req.lang || 'ar';
  const mapped = banners.map((b) => ({
    _id: b._id,
    title: lang === 'en' ? b.title_en : b.title_ar,
    image: lang === 'en' ? b.image_en : b.image_ar,
    linkType: b.linkType,
    linkPayload: b.linkPayload,
  }));

  return success(res, { banners: mapped });
});

const getCategories = asyncHandler(async (req, res) => {
  const subCategories = await ServiceSubCategory.find({ isActive: true }).sort({ parent: 1, sortOrder: 1 }).lean();

  const tree = Object.values(SERVICE_CATEGORIES).map((key) => ({
    key,
    subCategories: subCategories.filter((s) => s.parent === key).map((s) => ({
      _id: s._id,
      keyAr: s.keyAr,
      keyEn: s.keyEn,
      slug: s.slug,
      icon: s.icon,
      requiresVehicle: s.requiresVehicle,
    })),
  }));

  return success(res, { categories: tree });
});

const getCarWashPrices = asyncHandler(async (req, res) => {
  const prices = await CarWashPrice.find({ isActive: true }).sort({ vehicleSize: 1, washType: 1 }).lean();
  return success(res, { prices });
});

const getPublicConfig = asyncHandler(async (req, res) => {
  const all = await Config.getAll();
  const publicKeys = ['workingHours', 'maintenanceMode', 'paymentMethods', 'serviceRadius'];
  const filtered = {};
  for (const k of publicKeys) {
    if (all[k] !== undefined) filtered[k] = all[k];
  }
  return success(res, { config: filtered });
});

module.exports = { getBanners, getCategories, getCarWashPrices, getPublicConfig };
