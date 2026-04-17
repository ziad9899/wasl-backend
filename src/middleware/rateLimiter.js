const rateLimit = require('express-rate-limit');
const { error } = require('../utils/response');

const handler = (req, res) =>
  error(res, 'Too many requests. Please try again later.', 429);

const globalLimiter = rateLimit({
  windowMs:        parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  max:             parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
});

const otpLimiter = rateLimit({
  windowMs:        5 * 60 * 1000,
  max:             3,
  keyGenerator:    (req) => req.body.phone || req.ip,
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
});

const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
});

const uploadLimiter = rateLimit({
  windowMs:        60 * 1000,
  max:             20,
  standardHeaders: true,
  legacyHeaders:   false,
  handler,
});

module.exports = { globalLimiter, otpLimiter, authLimiter, uploadLimiter };