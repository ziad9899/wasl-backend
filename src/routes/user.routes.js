const router   = require('express').Router();
const { body, param } = require('express-validator');
const ctrl     = require('../controllers/user.controller');
const { protect }      = require('../middleware/auth');
const validate         = require('../middleware/validate');
const { uploadAvatar, handleUploadError } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');

router.use(protect);

router.get('/me',      ctrl.getMe);
router.put('/me',
  [
    body('name').optional().isLength({ min: 2, max: 60 }),
    body('email').optional().isEmail(),
    body('language').optional().isIn(['ar', 'en']),
  ],
  validate,
  ctrl.updateMe
);

router.put(
  '/me/avatar',
  uploadLimiter,
  uploadAvatar,
  handleUploadError,
  ctrl.updateAvatar
);

router.post(
  '/me/addresses',
  [
    body('label').notEmpty().withMessage('Label required'),
    body('lat').isFloat().withMessage('Valid lat required'),
    body('lng').isFloat().withMessage('Valid lng required'),
  ],
  validate,
  ctrl.addAddress
);

router.put(
  '/me/addresses/:addressId',
  [
    param('addressId').isMongoId(),
    body('lat').optional().isFloat(),
    body('lng').optional().isFloat(),
  ],
  validate,
  ctrl.updateAddress
);

router.delete('/me/addresses/:addressId', ctrl.deleteAddress);

router.put(
  '/me/device-token',
  [body('deviceToken').notEmpty()],
  validate,
  ctrl.updateDeviceToken
);

router.get('/me/wallet',       ctrl.getWalletBalance);
router.get('/me/transactions', ctrl.getTransactions);

module.exports = router;