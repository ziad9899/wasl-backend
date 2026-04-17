const mongoose = require('mongoose');
const { ACCOUNT_TYPE_LIST } = require('../constants');

const accountSchema = new mongoose.Schema({
  type: { type: String, enum: ACCOUNT_TYPE_LIST, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ownerType: { type: String, enum: ['user', 'system'], default: 'user' },
  currency: { type: String, default: 'SAR' },
  balance: { type: Number, default: 0, min: -100000000 },
  version: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

accountSchema.index({ ownerId: 1, type: 1 }, { unique: true, partialFilterExpression: { ownerId: { $type: 'objectId' } } });
accountSchema.index({ type: 1, ownerType: 1 });
accountSchema.index({ ownerType: 1, type: 1 }, { unique: true, partialFilterExpression: { ownerType: 'system' } });

accountSchema.statics.findOrCreateUserAccount = async function (userId, type, session = null) {
  const opts = session ? { session } : {};
  let account = await this.findOne({ ownerId: userId, type }).session(session || null);
  if (account) return account;
  const [created] = await this.create(
    [{ ownerId: userId, ownerType: 'user', type, balance: 0 }],
    opts
  );
  return created;
};

accountSchema.statics.findSystemAccount = async function (type, session = null) {
  return this.findOne({ ownerType: 'system', type }).session(session || null);
};

module.exports = mongoose.model('Account', accountSchema);
