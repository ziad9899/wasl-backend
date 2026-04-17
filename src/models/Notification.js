const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  type: {
    type:     String,
    enum:     [
      'order_new',
      'order_accepted',
      'order_rejected',
      'order_status_update',
      'order_completed',
      'order_cancelled',
      'bid_new',
      'bid_accepted',
      'payment_received',
      'withdrawal_processed',
      'account_suspended',
      'account_approved',
      'promo',
      'system',
    ],
    required: true,
  },

  title_ar: { type: String, required: true },
  title_en: { type: String, required: true },
  body_ar:  { type: String, required: true },
  body_en:  { type: String, required: true },

  data:   { type: mongoose.Schema.Types.Mixed, default: {} },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date,    default: null },
}, {
  timestamps: true,
});

notificationSchema.index({ userId:    1, createdAt: -1 });
notificationSchema.index({ userId:    1, isRead:     1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('Notification', notificationSchema);