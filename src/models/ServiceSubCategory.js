const mongoose = require('mongoose');
const { SERVICE_CATEGORY_LIST } = require('../constants');

const subCategorySchema = new mongoose.Schema({
  parent: { type: String, enum: SERVICE_CATEGORY_LIST, required: true },
  keyAr: { type: String, required: true },
  keyEn: { type: String, required: true },
  slug: { type: String, required: true, lowercase: true, trim: true },
  icon: { type: String, default: '' },
  sortOrder: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  requiresVehicle: { type: Boolean, default: false },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

subCategorySchema.index({ parent: 1, isActive: 1, sortOrder: 1 });
subCategorySchema.index({ slug: 1 }, { unique: true });

module.exports = mongoose.model('ServiceSubCategory', subCategorySchema);
