const mongoose = require('mongoose');

const fraudFlagSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  signal: {
    type: String,
    enum: [
      'velocity',
      'ip_collision',
      'location_spoof',
      'cancellation_spike',
      'sybil_suspected',
      'bid_ring_suspected',
      'withdrawal_anomaly',
    ],
    required: true,
  },
  severity: { type: String, enum: ['low', 'medium', 'high'], required: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  resolutionNote: { type: String, default: '' },
}, { timestamps: true });

fraudFlagSchema.index({ userId: 1, createdAt: -1 });
fraudFlagSchema.index({ signal: 1, severity: 1 });
fraudFlagSchema.index({ resolvedAt: 1 }, { sparse: true });

module.exports = mongoose.model('FraudFlag', fraudFlagSchema);
