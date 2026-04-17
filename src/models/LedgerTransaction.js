const mongoose = require('mongoose');
const { TX_KINDS } = require('../constants');

const ledgerTxSchema = new mongoose.Schema({
  idempotencyKey: { type: String, required: true },
  kind: { type: String, enum: Object.values(TX_KINDS), required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  initiatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  narration: { type: String, default: '' },
  postedAt: { type: Date, default: Date.now },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerTransaction', default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

ledgerTxSchema.index({ idempotencyKey: 1 }, { unique: true });
ledgerTxSchema.index({ orderId: 1 });
ledgerTxSchema.index({ kind: 1, postedAt: -1 });
ledgerTxSchema.index({ postedAt: -1 });

module.exports = mongoose.model('LedgerTransaction', ledgerTxSchema);
