const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title_ar: { type: String, required: true },
  title_en: { type: String, required: true },
  image_ar: { type: String, required: true },
  image_en: { type: String, required: true },
  linkType: {
    type: String,
    enum: ['none', 'service', 'external', 'coupon'],
    default: 'none',
  },
  linkPayload: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  startsAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

bannerSchema.index({ isActive: 1, sortOrder: 1 });
bannerSchema.index({ startsAt: 1, expiresAt: 1 });

module.exports = mongoose.model('Banner', bannerSchema);
