const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/admin.auth.controller');
const { authLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const { protectAdmin } = require('../middleware/adminAuth');

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  validate,
  ctrl.login
);

router.post(
  '/verify-mfa',
  authLimiter,
  [
    body('mfaToken').notEmpty(),
    body('code').isLength({ min: 6, max: 6 }),
  ],
  validate,
  ctrl.verifyMfa
);

router.post(
  '/refresh',
  [body('refreshToken').notEmpty()],
  validate,
  ctrl.refresh
);

router.post('/logout', protectAdmin, ctrl.logout);
router.get('/me', protectAdmin, ctrl.me);

module.exports = router;
