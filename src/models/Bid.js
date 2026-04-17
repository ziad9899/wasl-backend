const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  orderId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Order',
    required: true,
  },
  providerId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  price:       { type: Number, required: true, min: 0 },
  note:        { type: String, default: '', maxlength: 500 },
  arrivalTime: { type: Number, default: null },

  status: {
    type:    String,
    enum:    ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },

  expiresAt: { type: Date, default: null },
}, {
  timestamps: true,
});

bidSchema.index({ orderId:    1, createdAt:  1 });
bidSchema.index({ orderId:    1, status:     1 });
bidSchema.index({ providerId: 1, createdAt: -1 });
bidSchema.index({ orderId: 1, price: 1 });

module.exports = mongoose.model('Bid', bidSchema);