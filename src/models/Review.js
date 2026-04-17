const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  orderId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Order',
    required: true,
  },
  fromUser: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },
  toUser: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  role: {
    type: String,
    enum: ['client_to_provider', 'provider_to_client'],
    required: true,
  },

  rating:  { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '', maxlength: 1000 },

  isVisibleToPublic: { type: Boolean, default: true },
  isDeleted:         { type: Boolean, default: false },
}, {
  timestamps: true,
});

reviewSchema.index({ toUser:  1, role: 1 });
reviewSchema.index({ orderId: 1 });
reviewSchema.index({ fromUser: 1 });

module.exports = mongoose.model('Review', reviewSchema);