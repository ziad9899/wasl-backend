const mongoose = require('mongoose');
const {
  SERVICE_CATEGORY_LIST,
  ORDER_STATUS,
  ORDER_STATUS_LIST,
  PAYMENT_METHOD_LIST,
  PAYMENT_STATUS,
} = require('../constants');

const orderItemSchema = new mongoose.Schema({
  serviceCategory: { type: String, enum: SERVICE_CATEGORY_LIST, required: true },
  subCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceSubCategory', default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  price: { type: Number, default: 0, min: 0 },
  isFixedPrice: { type: Boolean, default: false },
}, { _id: true });

const timelineSchema = new mongoose.Schema({
  status: { type: String, required: true },
  note: { type: String, default: '' },
  actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  actorRole: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  items: { type: [orderItemSchema], default: [] },
  serviceCategory: { type: String, enum: SERVICE_CATEGORY_LIST, required: true },
  pricingType: { type: String, enum: ['fixed', 'bid'], required: true },

  serviceDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  notes: { type: String, default: '', maxlength: 500 },

  status: {
    type: String,
    enum: ORDER_STATUS_LIST,
    default: ORDER_STATUS.PENDING,
  },

  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },
    address: { type: String, default: '' },
  },
  addressId: { type: mongoose.Schema.Types.ObjectId, default: null },

  subtotal: { type: Number, default: 0 },
  agreedPrice: { type: Number, default: 0 },
  distanceFee: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  totalPrice: { type: Number, default: 0 },
  providerPayout: { type: Number, default: 0 },

  commission: {
    rate: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },

  photos: {
    before: { type: [String], default: [] },
    after: { type: [String], default: [] },
  },

  timeline: { type: [timelineSchema], default: [] },

  paymentStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.UNPAID,
  },
  paymentMethod: {
    type: String,
    enum: PAYMENT_METHOD_LIST,
    default: 'cash',
  },
  paymentReference: { type: String, default: '' },
  paymentGateway: { type: String, default: '' },
  paymentCapturedAt: { type: Date, default: null },

  broadcastedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  rejectedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  broadcastAttemptCount: { type: Number, default: 0 },

  estimatedArrival: { type: Number, default: null },

  chatRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null },
  maskedPhoneSessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaskedPhoneSession', default: null },

  couponCode: { type: String, default: '' },
  couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon', default: null },

  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  cancellationReason: { type: String, default: '' },
  cancelledAt: { type: Date, default: null },

  expiresAt: { type: Date, default: null },

  cashSettledByProvider: { type: Boolean, default: false },
  cashSettledAt: { type: Date, default: null },

  version: { type: Number, default: 0 },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

orderSchema.index({ clientId: 1, createdAt: -1 });
orderSchema.index({ providerId: 1, createdAt: -1 });
orderSchema.index({ status: 1 });
orderSchema.index({ serviceCategory: 1, status: 1 });
orderSchema.index({ location: '2dsphere' });
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ paymentStatus: 1, status: 1 });
orderSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { status: { $in: ['broadcasting', 'pending'] } } }
);

orderSchema.pre('save', function (next) {
  if (this.isNew) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.orderNumber = `WSL-${ts}-${rand}`;
  }
  next();
});

orderSchema.pre('save', function (next) {
  if (this.isModified('agreedPrice') || this.isModified('discountAmount') || this.isModified('distanceFee')) {
    const total = Math.max(0, (this.agreedPrice || 0) + (this.distanceFee || 0) - (this.discountAmount || 0));
    this.totalPrice = total;
    this.providerPayout = Math.max(0, total - (this.commission?.amount || 0));
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
