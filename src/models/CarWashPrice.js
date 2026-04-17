const mongoose = require('mongoose');
const { CAR_WASH_VEHICLE_SIZES, CAR_WASH_TYPES } = require('../constants');

const carWashPriceSchema = new mongoose.Schema({
  vehicleSize: { type: String, enum: CAR_WASH_VEHICLE_SIZES, required: true },
  washType: { type: String, enum: CAR_WASH_TYPES, required: true },
  price: { type: Number, required: true, min: 0 },
  isActive: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
}, { timestamps: true });

carWashPriceSchema.index({ vehicleSize: 1, washType: 1 }, { unique: true });
carWashPriceSchema.index({ isActive: 1 });

module.exports = mongoose.model('CarWashPrice', carWashPriceSchema);
