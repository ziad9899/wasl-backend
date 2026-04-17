const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  refereeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  code: { type: String, required: true, uppercase: true },
  status: {
    type: String,
    enum: ['registered', 'qualified', 'rewarded'],
    default: 'registered',
  },
  firstOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  bonusAmount: { type: Number, default: 0 },
  rewardedAt: { type: Date, default: null },
}, { timestamps: true });

referralSchema.index({ referrerId: 1, createdAt: -1 });
referralSchema.index({ refereeId: 1 }, { unique: true });
referralSchema.index({ status: 1 });

module.exports = mongoose.model('Referral', referralSchema);
