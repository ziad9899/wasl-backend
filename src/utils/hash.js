const crypto = require('crypto');

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const hmacSha256 = (value, secret) =>
  crypto.createHmac('sha256', secret).update(String(value)).digest('hex');

const timingSafeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

module.exports = { sha256, hmacSha256, timingSafeEqual, randomToken };
