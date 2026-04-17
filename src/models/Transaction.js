const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type:     String,
    enum:     ['payment', 'commission', 'refund', 'withdrawal', 'topup', 'earning'],
    required: true,
  },

  userId:  {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  orderId: {
    type:    mongoose.Schema.Types.ObjectId,
    ref:     'Order',
    default: null,
  },

  amount:   { type: Number, required: true },
  currency: { type: String, default: 'SAR' },

  status: {
    type:    String,
    enum:    ['pending', 'completed', 'failed'],
    default: 'pending',
  },

  reference:   { type: String, default: '' },
  description: { type: String, default: '' },

  balanceBefore: { type: Number, default: 0 },
  balanceAfter:  { type: Number, default: 0 },
}, {
  timestamps: true,
});

transactionSchema.index({ userId:  1, createdAt: -1 });
transactionSchema.index({ orderId: 1 });
transactionSchema.index({ type:    1 });
transactionSchema.index({ status:  1 });

module.exports = mongoose.model('Transaction', transactionSchema);