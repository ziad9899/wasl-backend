const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  key:   { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
}, {
  timestamps: true,
});

configSchema.index({ key: 1 }, { unique: true });

configSchema.statics.get = async function (key) {
  const doc = await this.findOne({ key });
  return doc ? doc.value : null;
};

configSchema.statics.set = async function (key, value) {
  return this.findOneAndUpdate(
    { key },
    { key, value },
    { upsert: true, new: true }
  );
};

configSchema.statics.getAll = async function () {
  const docs = await this.find({});
  return docs.reduce((acc, doc) => {
    acc[doc.key] = doc.value;
    return acc;
  }, {});
};

module.exports = mongoose.model('Config', configSchema);