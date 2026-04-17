const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: {
    type:     String,
    required: true,
    uppercase: true,
    trim:      true,
  },

  discountType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: true,
  },
  discountValue: { type: Number, required: true, min: 0 },

  maxUses:       { type: Number, default: null },
  usedCount:     { type: Number, default: 0 },

  minOrderValue: { type: Number, default: 0 },
  maxDiscount:   { type: Number, default: null },

  isActive:  { type: Boolean, default: true },
  expiresAt: { type: Date,    default: null },

  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, {
  timestamps: true,
});

couponSchema.index({ code:     1 }, { unique: true });
couponSchema.index({ isActive: 1 });

module.exports = mongoose.model('Coupon', couponSchema);