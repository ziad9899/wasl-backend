const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { otpLimiter, authLimiter } = require('../middleware/rateLimiter');

router.post(
  '/send-otp',
  otpLimiter,
  [body('phone').notEmpty().isLength({ min: 8, max: 20 })],
  validate,
  ctrl.sendOtpHandler
);

router.post(
  '/verify-otp',
  authLimiter,
  [
    body('phone').notEmpty(),
    body('code').isLength({ min: 4, max: 6 }).isNumeric(),
    body('deviceToken').optional().isLength({ min: 10 }),
    body('devicePlatform').optional().isIn(['ios', 'android']),
  ],
  validate,
  ctrl.verifyOtpHandler
);

router.put(
  '/register',
  protect,
  [
    body('name').optional().isLength({ min: 2, max: 60 }),
    body('email').optional().isEmail(),
    body('role').optional().isIn(['client', 'provider']),
    body('language').optional().isIn(['ar', 'en']),
    body('referralCode').optional().isLength({ min: 4, max: 16 }),
    body('consentPdpl').equals('true').toBoolean(),
    body('consentMarketing').optional().toBoolean(),
  ],
  validate,
  ctrl.completeRegistration
);

router.post(
  '/refresh-token',
  [body('refreshToken').notEmpty()],
  validate,
  ctrl.refreshToken
);

router.post('/logout', protect, ctrl.logout);

module.exports = router;
