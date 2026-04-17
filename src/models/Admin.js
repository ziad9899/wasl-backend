const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: { type: String, required: true, select: false },
  mfaSecret: { type: String, select: false, default: null },
  mfaEnabled: { type: Boolean, default: false },
  permissions: { type: [String], default: [] },
  isSuperAdmin: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  lastLoginAt: { type: Date, default: null },
  lastLoginIp: { type: String, default: '' },
  failedLoginCount: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
}, { timestamps: true });

adminSchema.index({ email: 1 }, { unique: true });
adminSchema.index({ permissions: 1 });
adminSchema.index({ status: 1 });

module.exports = mongoose.model('Admin', adminSchema);
