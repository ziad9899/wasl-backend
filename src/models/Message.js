const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chatId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Chat',
    required: true,
  },
  senderId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  type: {
    type:    String,
    enum:    ['text', 'image', 'location'],
    default: 'text',
  },

  content:  { type: String, default: '' },
  mediaUrl: { type: String, default: '' },

  location: {
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
  },

  isRead:   { type: Boolean, default: false },
  readAt:   { type: Date,    default: null },
}, {
  timestamps: true,
});

messageSchema.index({ chatId:    1, createdAt:  1 });
messageSchema.index({ senderId:  1 });
messageSchema.index({ isRead:    1 });

module.exports = mongoose.model('Message', messageSchema);