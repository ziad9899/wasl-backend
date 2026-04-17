const mongoose = require('mongoose');

const broadcastAttemptSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  attemptNumber: { type: Number, required: true },
  strategy: { type: String, enum: ['fixed_sequential', 'bid_fanout'], required: true },
  providersNotified: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  winnerProviderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  outcome: {
    type: String,
    enum: ['accepted', 'rejected', 'timeout', 'no_providers', 'expired'],
    default: null,
  },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
}, { timestamps: true });

broadcastAttemptSchema.index({ orderId: 1, attemptNumber: 1 }, { unique: true });
broadcastAttemptSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BroadcastAttempt', broadcastAttemptSchema);
