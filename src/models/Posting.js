const mongoose = require('mongoose');

const postingSchema = new mongoose.Schema({
  txId: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerTransaction', required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', required: true },
  direction: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
  amount: { type: Number, required: true, min: 1 },
  balanceAfter: { type: Number, required: true },
}, { timestamps: true });

postingSchema.index({ txId: 1 });
postingSchema.index({ accountId: 1, createdAt: -1 });
postingSchema.index({ accountId: 1, direction: 1 });

module.exports = mongoose.model('Posting', postingSchema);
