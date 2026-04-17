const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true },
  codeHash: { type: String, required: true },
  purpose: {
    type: String,
    enum: ['login', 'withdrawal_confirm', 'erasure_confirm', 'change_phone'],
    default: 'login',
  },
  attempts: { type: Number, default: 0 },
  isUsed: { type: Boolean, default: false },
  usedAt: { type: Date, default: null },
  requestedIp: { type: String, default: '' },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 5 * 60 * 1000),
  },
}, { timestamps: true });

otpSchema.index({ phone: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);
