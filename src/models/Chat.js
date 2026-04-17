const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  orderId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Order',
    required: true,
  },
  clientId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },
  providerId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  lastMessage:   { type: String,  default: '' },
  lastMessageAt: { type: Date,    default: null },

  unreadCount: {
    type:    Map,
    of:      Number,
    default: {},
  },

  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
});

chatSchema.index({ orderId:    1 }, { unique: true });
chatSchema.index({ clientId:   1, lastMessageAt: -1 });
chatSchema.index({ providerId: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);