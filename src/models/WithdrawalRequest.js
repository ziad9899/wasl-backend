const mongoose = require('mongoose');
const { WITHDRAWAL_STATUS } = require('../constants');

const withdrawalRequestSchema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true, min: 1 },
  currency: { type: String, default: 'SAR' },
  status: {
    type: String,
    enum: Object.values(WITHDRAWAL_STATUS),
    default: WITHDRAWAL_STATUS.PENDING,
  },
  bankIban: { type: String, required: true },
  accountName: { type: String, required: true },
  bankName: { type: String, default: '' },
  rejectionReason: { type: String, default: '' },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  processedAt: { type: Date, default: null },
  externalRef: { type: String, default: '' },
  ledgerTxId: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerTransaction', default: null },
}, { timestamps: true });

withdrawalRequestSchema.index({ providerId: 1, createdAt: -1 });
withdrawalRequestSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('WithdrawalRequest', withdrawalRequestSchema);
