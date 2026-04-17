require('dotenv').config();
const mongoose = require('mongoose');
const argon2 = require('argon2');
const Config = require('../models/Config');
const Admin = require('../models/Admin');
const CarWashPrice = require('../models/CarWashPrice');
const ServiceSubCategory = require('../models/ServiceSubCategory');
const logger = require('../utils/logger');
const ledgerService = require('../services/ledger.service');
const { CONFIG_KEYS, SERVICE_CATEGORIES } = require('../constants');

const DEFAULT_CONFIGS = [
  { key: CONFIG_KEYS.SERVICE_RADIUS, value: 10, type: 'number', category: 'geo' },
  { key: CONFIG_KEYS.WORKING_HOURS, value: { start: '06:00', end: '23:00' }, type: 'object', category: 'ops' },
  { key: CONFIG_KEYS.COMMISSION_RATE, value: 10, type: 'number', category: 'pricing' },
  { key: CONFIG_KEYS.ORDER_ACCEPTANCE_WINDOW, value: 60, type: 'number', category: 'ops' },
  { key: CONFIG_KEYS.DISTANCE_FEE_PER_KM, value: 0, type: 'number', category: 'pricing' },
  { key: CONFIG_KEYS.MIN_RATING_THRESHOLD, value: 2, type: 'number', category: 'ops' },
  { key: CONFIG_KEYS.PAYMENT_METHODS, value: { cash: true, card: true, wallet: true, tabby: true, apple_pay: true }, type: 'object', category: 'payment' },
  { key: CONFIG_KEYS.MAINTENANCE_MODE, value: false, type: 'boolean', category: 'ops' },
  { key: CONFIG_KEYS.REFERRAL_BONUS, value: 0, type: 'number', category: 'pricing' },
  { key: CONFIG_KEYS.MAX_BIDS_PER_ORDER, value: 10, type: 'number', category: 'ops' },
  { key: CONFIG_KEYS.MAX_BROADCAST_ATTEMPTS, value: 5, type: 'number', category: 'ops' },
  { key: CONFIG_KEYS.MIN_WITHDRAWAL, value: 10000, type: 'number', category: 'payment' },
  { key: CONFIG_KEYS.MAX_WITHDRAWAL_PER_DAY, value: 500000, type: 'number', category: 'payment' },
  { key: CONFIG_KEYS.BID_EXPIRY_MINUTES, value: 10, type: 'number', category: 'ops' },
];

const CAR_WASH_DEFAULT_PRICES = [
  { vehicleSize: 'small', washType: 'exterior_basic', price: 3000 },
  { vehicleSize: 'small', washType: 'exterior_wax', price: 4000 },
  { vehicleSize: 'small', washType: 'exterior_wax_double', price: 5000 },
  { vehicleSize: 'small', washType: 'exterior_plus_interior_basic', price: 5000 },
  { vehicleSize: 'small', washType: 'exterior_plus_interior_wax', price: 6000 },
  { vehicleSize: 'small', washType: 'exterior_plus_interior_double', price: 7000 },
  { vehicleSize: 'small', washType: 'interior_only', price: 3500 },
  { vehicleSize: 'medium', washType: 'exterior_basic', price: 4000 },
  { vehicleSize: 'medium', washType: 'exterior_wax', price: 5000 },
  { vehicleSize: 'medium', washType: 'exterior_wax_double', price: 6000 },
  { vehicleSize: 'medium', washType: 'exterior_plus_interior_basic', price: 6000 },
  { vehicleSize: 'medium', washType: 'exterior_plus_interior_wax', price: 7000 },
  { vehicleSize: 'medium', washType: 'exterior_plus_interior_double', price: 8000 },
  { vehicleSize: 'medium', washType: 'interior_only', price: 4500 },
  { vehicleSize: 'large', washType: 'exterior_basic', price: 5000 },
  { vehicleSize: 'large', washType: 'exterior_wax', price: 6000 },
  { vehicleSize: 'large', washType: 'exterior_wax_double', price: 7000 },
  { vehicleSize: 'large', washType: 'exterior_plus_interior_basic', price: 7000 },
  { vehicleSize: 'large', washType: 'exterior_plus_interior_wax', price: 8000 },
  { vehicleSize: 'large', washType: 'exterior_plus_interior_double', price: 9500 },
  { vehicleSize: 'large', washType: 'interior_only', price: 5500 },
];

const SUBCATEGORIES = [
  { parent: SERVICE_CATEGORIES.APPLIANCE_REPAIR, keyAr: 'ثلاجة', keyEn: 'Refrigerator', slug: 'refrigerator' },
  { parent: SERVICE_CATEGORIES.APPLIANCE_REPAIR, keyAr: 'غسالة', keyEn: 'Washing Machine', slug: 'washing-machine' },
  { parent: SERVICE_CATEGORIES.APPLIANCE_REPAIR, keyAr: 'فرن', keyEn: 'Oven', slug: 'oven' },
  { parent: SERVICE_CATEGORIES.APPLIANCE_REPAIR, keyAr: 'تلفزيون', keyEn: 'TV', slug: 'tv' },
  { parent: SERVICE_CATEGORIES.APPLIANCE_REPAIR, keyAr: 'مكيف سبليت', keyEn: 'Split AC', slug: 'split-ac' },
  { parent: SERVICE_CATEGORIES.APPLIANCE_REPAIR, keyAr: 'مكيف شباك', keyEn: 'Window AC', slug: 'window-ac' },
  { parent: SERVICE_CATEGORIES.APPLIANCE_REPAIR, keyAr: 'مكيف مركزي', keyEn: 'Central AC', slug: 'central-ac' },
  { parent: SERVICE_CATEGORIES.APPLIANCE_REPAIR, keyAr: 'رسيفر', keyEn: 'Receiver', slug: 'receiver' },
  { parent: SERVICE_CATEGORIES.HOME_MAINTENANCE, keyAr: 'سباكة', keyEn: 'Plumbing', slug: 'plumbing' },
  { parent: SERVICE_CATEGORIES.HOME_MAINTENANCE, keyAr: 'كهرباء', keyEn: 'Electrical', slug: 'electrical' },
  { parent: SERVICE_CATEGORIES.HOME_MAINTENANCE, keyAr: 'نجارة', keyEn: 'Carpentry', slug: 'carpentry' },
  { parent: SERVICE_CATEGORIES.HOME_MAINTENANCE, keyAr: 'دهانات', keyEn: 'Painting', slug: 'painting' },
  { parent: SERVICE_CATEGORIES.HOME_MAINTENANCE, keyAr: 'تبليط', keyEn: 'Tiling', slug: 'tiling' },
  { parent: SERVICE_CATEGORIES.CLEANING, keyAr: 'تنظيف منزل شامل', keyEn: 'Deep Home Cleaning', slug: 'deep-cleaning' },
  { parent: SERVICE_CATEGORIES.CLEANING, keyAr: 'غسيل خزانات', keyEn: 'Water Tank Cleaning', slug: 'tank-cleaning' },
  { parent: SERVICE_CATEGORIES.CLEANING, keyAr: 'جلي وتلميع', keyEn: 'Polishing', slug: 'polishing' },
  { parent: SERVICE_CATEGORIES.MOVING, keyAr: 'نقل عفش', keyEn: 'Furniture Moving', slug: 'furniture-moving', requiresVehicle: true },
  { parent: SERVICE_CATEGORIES.MOVING, keyAr: 'دباب توصيل', keyEn: 'Motorbike Delivery', slug: 'motorbike', requiresVehicle: true },
  { parent: SERVICE_CATEGORIES.MOVING, keyAr: 'دينة', keyEn: 'Pickup Truck', slug: 'pickup', requiresVehicle: true },
  { parent: SERVICE_CATEGORIES.MOVING, keyAr: 'هايلكس', keyEn: 'Hilux', slug: 'hilux', requiresVehicle: true },
  { parent: SERVICE_CATEGORIES.PEST_CONTROL, keyAr: 'رش المنزل', keyEn: 'Home Pest Control', slug: 'home-pest' },
  { parent: SERVICE_CATEGORIES.PEST_CONTROL, keyAr: 'رش زراعي', keyEn: 'Agricultural Pest Control', slug: 'agri-pest' },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { family: 4 });
    logger.info('Connected to MongoDB');

    for (const config of DEFAULT_CONFIGS) {
      await Config.findOneAndUpdate(
        { key: config.key },
        config,
        { upsert: true, new: true }
      );
    }
    logger.info(`Seeded ${DEFAULT_CONFIGS.length} configs`);

    await ledgerService.ensureSystemAccounts();
    logger.info('Ledger system accounts ensured');

    for (const price of CAR_WASH_DEFAULT_PRICES) {
      await CarWashPrice.findOneAndUpdate(
        { vehicleSize: price.vehicleSize, washType: price.washType },
        { ...price, isActive: true },
        { upsert: true, new: true }
      );
    }
    logger.info(`Seeded ${CAR_WASH_DEFAULT_PRICES.length} car wash prices`);

    for (const sub of SUBCATEGORIES) {
      await ServiceSubCategory.findOneAndUpdate(
        { slug: sub.slug },
        { ...sub, isActive: true },
        { upsert: true, new: true }
      );
    }
    logger.info(`Seeded ${SUBCATEGORIES.length} subcategories`);

    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@wasl.sa';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Wasl@2026!';
    const existingAdmin = await Admin.findOne({ email: adminEmail });
    if (!existingAdmin) {
      const passwordHash = await argon2.hash(adminPassword, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      await Admin.create({
        name: 'Super Admin',
        email: adminEmail,
        passwordHash,
        isSuperAdmin: true,
        permissions: [],
        status: 'active',
      });
      logger.info(`Super admin created: ${adminEmail}`);
    } else {
      logger.info(`Super admin already exists: ${adminEmail}`);
    }

    logger.info('Seed completed');
    process.exit(0);
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Seed failed');
    process.exit(1);
  }
};

seed();
