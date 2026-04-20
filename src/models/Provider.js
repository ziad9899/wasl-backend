const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  url:        { type: String, default: '' },
  publicId:   { type: String, default: '' },
  verified:   { type: Boolean, default: false },
}, { _id: false });

const providerSchema = new mongoose.Schema({
  userId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },

  specialty: {
    type:     [String],
    enum:     [
      'car_wash',
      'appliance_repair',
      'home_maintenance',
      'cleaning',
      'moving',
      'pest_control',
    ],
    required: true,
  },

  documents: {
    nationalId: {
      front: documentSchema,
      back:  documentSchema,
    },
    residencePermit: {
      front: documentSchema,
      back:  documentSchema,
    },
    drivingLicense:  documentSchema,
    profilePhoto:    documentSchema,
    professionCard:  documentSchema,
  },

  vehicle: {
    type:  { type: String, default: '' },
    model: { type: String, default: '' },
    year:  { type: Number, default: null },
  },

  approvalStatus: {
    type:    String,
    enum:    ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  approvalNote: { type: String, default: '' },

  // Distinguishes "draft" (provider record exists but the user is still
  // filling out documents) from "submitted-for-review" (user pressed
  // "ارسال الطلب", the application is now in the admin queue).
  // null  → draft, not in admin pending list, no review banner in app
  // Date  → admin review pending
  submittedAt: { type: Date, default: null },

  isOnline: { type: Boolean, default: false },

  currentLocation: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
  },
  locationUpdatedAt: { type: Date, default: null },

  serviceRadius: { type: Number, default: 10 },

  earnings: {
    total:     { type: Number, default: 0 },
    pending:   { type: Number, default: 0 },
    withdrawn: { type: Number, default: 0 },
  },

  bankInfo: {
    iban:        { type: String, default: '' },
    bankName:    { type: String, default: '' },
    accountName: { type: String, default: '' },
  },

  completedOrders:  { type: Number, default: 0 },
  cancelledOrders:  { type: Number, default: 0 },
  autoSuspended:    { type: Boolean, default: false },
}, {
  timestamps: true,
  toJSON:     { virtuals: true },
  toObject:   { virtuals: true },
});

providerSchema.index({ userId:          1 }, { unique: true });
providerSchema.index({ specialty:       1 });
providerSchema.index({ approvalStatus:  1 });
providerSchema.index({ isOnline:        1 });
providerSchema.index({ currentLocation: '2dsphere' });
providerSchema.index({ approvalStatus: 1, isOnline: 1, specialty: 1 });

module.exports = mongoose.model('Provider', providerSchema);