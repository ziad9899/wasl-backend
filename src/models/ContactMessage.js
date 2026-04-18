const mongoose = require('mongoose');

const contactMessageSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, default: '', trim: true },
  subject: { type: String, required: true, trim: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 3000 },
  type: {
    type: String,
    enum: ['general', 'provider', 'support', 'partnership'],
    default: 'general',
  },
  status: {
    type: String,
    enum: ['new', 'read', 'replied', 'archived'],
    default: 'new',
  },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  locale: { type: String, enum: ['ar', 'en'], default: 'ar' },
  repliedAt: { type: Date, default: null },
  repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

contactMessageSchema.index({ createdAt: -1 });
contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ type: 1 });
contactMessageSchema.index({ email: 1 });

module.exports = mongoose.model('ContactMessage', contactMessageSchema);
