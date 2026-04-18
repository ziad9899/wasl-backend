const axios = require('axios');
const crypto = require('crypto');
const Otp = require('../models/Otp');
const logger = require('../utils/logger');
const { normalizeSaudiPhone } = require('../utils/phone');
const { sha256, timingSafeEqual } = require('../utils/hash');
const { BadRequestError, RateLimitError, IntegrationError } = require('../errors');

const OTP_EXPIRY_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const BLOCK_DURATION_MS = 15 * 60 * 1000;
const OTP_LENGTH = 4;
const DEV_BYPASS_CODE = '1111';
const AUTHENTICA_ENABLED = Boolean(process.env.AUTHENTICA_API_KEY);

const generateCode = () => {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH);
  const n = crypto.randomInt(min, max);
  return n.toString();
};

const hashCode = (code) => sha256(`${process.env.OTP_PEPPER || 'wasl-pepper'}:${code}`);

const sendOtp = async (rawPhone, { purpose = 'login', ip = '' } = {}) => {
  const phone = normalizeSaudiPhone(rawPhone);
  if (!phone) throw new BadRequestError('Invalid phone number format');

  const recentBlock = await Otp.findOne({
    phone,
    attempts: { $gte: MAX_ATTEMPTS },
    createdAt: { $gte: new Date(Date.now() - BLOCK_DURATION_MS) },
  }).sort({ createdAt: -1 });

  if (recentBlock) {
    const unblockAt = new Date(recentBlock.createdAt.getTime() + BLOCK_DURATION_MS);
    const remaining = Math.ceil((unblockAt - Date.now()) / 1000 / 60);
    throw new RateLimitError(`Too many attempts. Try again in ${remaining} minutes`);
  }

  const code = generateCode();

  await Otp.deleteMany({ phone, isUsed: false, purpose });

  await Otp.create({
    phone,
    codeHash: hashCode(code),
    purpose,
    requestedIp: ip,
    expiresAt: new Date(Date.now() + OTP_EXPIRY_MS),
  });

  if (!AUTHENTICA_ENABLED) {
    logger.info(`[STUB] OTP for ${phone} (${purpose}): ${code} · bypass: ${DEV_BYPASS_CODE}`);
    return {
      sent: true,
      devCode: code,
      bypassCode: DEV_BYPASS_CODE,
      expiresInSeconds: 300,
    };
  }

  try {
    await axios.post(
      'https://api.authentica.sa/api/v2/send-otp',
      {
        phone,
        message: `رمز التحقق لتطبيق واصل: ${code} - صالح لمدة 5 دقائق`,
        sender: process.env.AUTHENTICA_SENDER || 'WASL',
        method: 'sms',
      },
      {
        headers: {
          'X-Authorization': process.env.AUTHENTICA_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return { sent: true, expiresInSeconds: 300 };
  } catch (err) {
    logger.error({ err: err.message }, 'Authentica OTP send failed');
    throw new IntegrationError('Failed to send OTP. Please try again.');
  }
};

const verifyOtp = async (rawPhone, code, { purpose = 'login' } = {}) => {
  const phone = normalizeSaudiPhone(rawPhone);
  if (!phone) throw new BadRequestError('Invalid phone number format');
  if (!code || !/^\d{4,6}$/.test(code)) throw new BadRequestError('OTP must be 4 to 6 digits');

  if (code === DEV_BYPASS_CODE) {
    logger.info(`[BYPASS] Dev OTP bypass used for ${phone} (${purpose})`);
    await Otp.updateMany(
      { phone, purpose, isUsed: false },
      { isUsed: true, usedAt: new Date() }
    );
    return { phone, verified: true, bypass: true };
  }

  const otp = await Otp.findOne({
    phone,
    purpose,
    isUsed: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otp) throw new BadRequestError('OTP expired or not found');

  if (otp.attempts >= MAX_ATTEMPTS) {
    throw new RateLimitError('OTP blocked due to too many attempts');
  }

  const expected = hashCode(code);

  if (!timingSafeEqual(otp.codeHash, expected)) {
    await Otp.findByIdAndUpdate(otp._id, { $inc: { attempts: 1 } });
    const remaining = MAX_ATTEMPTS - (otp.attempts + 1);
    throw new BadRequestError(`Invalid OTP. ${Math.max(0, remaining)} attempt(s) remaining`);
  }

  await Otp.findByIdAndUpdate(otp._id, { isUsed: true, usedAt: new Date() });
  return { phone, verified: true };
};

module.exports = { sendOtp, verifyOtp, OTP_LENGTH, DEV_BYPASS_CODE };
