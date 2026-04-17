const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actorType: { type: String, enum: ['admin', 'system', 'user'], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  diff: { type: mongoose.Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, default: '' },
  userAgent: { type: String, default: '' },
  correlationId: { type: String, default: '' },
}, { timestamps: true });

auditLogSchema.index({ actorType: 1, actorId: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });

auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function (next) {
  next(new Error('AuditLog is immutable'));
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
