const mongoose = require('mongoose');
const { DSR_TYPES, DSR_STATUS } = require('../constants');

const dsrSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: Object.values(DSR_TYPES), required: true },
  status: { type: String, enum: Object.values(DSR_STATUS), default: DSR_STATUS.RECEIVED },
  requestedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
  exportUrl: { type: String, default: '' },
  exportExpiresAt: { type: Date, default: null },
  gracePeriodEndsAt: { type: Date, default: null },
  rejectionReason: { type: String, default: '' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reason: { type: String, default: '' },
}, { timestamps: true });

dsrSchema.index({ userId: 1, createdAt: -1 });
dsrSchema.index({ status: 1, createdAt: 1 });
dsrSchema.index({ gracePeriodEndsAt: 1 }, { sparse: true });

module.exports = mongoose.model('DSRRequest', dsrSchema);
