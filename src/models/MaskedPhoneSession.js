const mongoose = require('mongoose');

const maskedPhoneSessionSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  clientPhone: { type: String, required: true },
  providerPhone: { type: String, required: true },
  maskedNumber: { type: String, required: true },
  providerName: { type: String, default: 'unifonic' },
  externalSessionId: { type: String, required: true },
  status: {
    type: String,
    enum: ['active', 'expired', 'terminated'],
    default: 'active',
  },
  expiresAt: { type: Date, required: true },
  callHistory: {
    type: [{
      direction: { type: String, enum: ['client_to_provider', 'provider_to_client'] },
      startedAt: Date,
      durationSec: Number,
    }],
    default: [],
  },
}, { timestamps: true });

maskedPhoneSessionSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
maskedPhoneSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
maskedPhoneSessionSchema.index({ externalSessionId: 1 });

module.exports = mongoose.model('MaskedPhoneSession', maskedPhoneSessionSchema);
