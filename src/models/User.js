const mongoose = require('mongoose');
const { USER_ROLES, USER_STATUS } = require('../constants');

const addressSchema = new mongoose.Schema({
  label: { type: String, required: true },
  details: { type: String, default: '' },
  coordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
  },
  isDefault: { type: Boolean, default: false },
}, { _id: true });

const deviceTokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
  platform: { type: String, enum: ['ios', 'android'], default: 'android' },
  lastSeenAt: { type: Date, default: Date.now },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    minlength: 2,
    maxlength: 60,
  },
  phone: {
    type: String,
    required: [true, 'Phone is required'],
    trim: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
  },
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.CLIENT,
  },
  status: {
    type: String,
    enum: Object.values(USER_STATUS),
    default: USER_STATUS.PENDING_PROFILE,
  },
  avatar: { type: String, default: '' },
  avatarId: { type: String, default: '' },

  addresses: { type: [addressSchema], default: [] },
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
  },

  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 },
  },

  referralCode: { type: String },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  deviceTokens: { type: [deviceTokenSchema], default: [] },
  language: { type: String, enum: ['ar', 'en'], default: 'ar' },

  isVerified: { type: Boolean, default: false },
  lastSeenAt: { type: Date, default: null },

  consentPdplAt: { type: Date, default: null },
  consentMarketingAt: { type: Date, default: null },
  isMinor: { type: Boolean, default: false },

  deletedAt: { type: Date, default: null },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ referralCode: 1 }, { unique: true, sparse: true });
userSchema.index({ currentLocation: '2dsphere' });
userSchema.index({ 'addresses.coordinates': '2dsphere' });
userSchema.index({ createdAt: -1 });
userSchema.index({ deletedAt: 1 }, { sparse: true });

userSchema.pre('save', function (next) {
  if (this.isNew && !this.referralCode) {
    this.referralCode = Math.random().toString(36).substring(2, 10).toUpperCase();
  }
  next();
});

userSchema.methods.addDeviceToken = function (token, platform = 'android') {
  if (!token) return;
  const existing = this.deviceTokens.find((t) => t.token === token);
  if (existing) {
    existing.lastSeenAt = new Date();
    existing.platform = platform;
    return;
  }
  this.deviceTokens.push({ token, platform, lastSeenAt: new Date() });
  if (this.deviceTokens.length > 5) this.deviceTokens.shift();
};

userSchema.methods.removeDeviceToken = function (token) {
  this.deviceTokens = this.deviceTokens.filter((t) => t.token !== token);
};

userSchema.methods.deviceTokenList = function () {
  return this.deviceTokens.map((d) => d.token);
};

module.exports = mongoose.model('User', userSchema);
