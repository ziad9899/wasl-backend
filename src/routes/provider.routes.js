const router   = require('express').Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/provider.controller');
const { protect, restrictTo }               = require('../middleware/auth');
const validate                              = require('../middleware/validate');
const { uploadDocument, handleUploadError } = require('../middleware/upload');
const { uploadLimiter }                     = require('../middleware/rateLimiter');

router.get('/:id', ctrl.getPublicProvider);

router.use(protect);

router.post(
  '/register',
  [
    body('specialty')
      .notEmpty()
      .withMessage('Specialty is required'),
  ],
  validate,
  ctrl.registerProvider
);

router.get('/profile', restrictTo('provider'), ctrl.getMyProfile);

router.put(
  '/profile',
  restrictTo('provider'),
  [
    body('serviceRadius').optional().isFloat({ min: 1, max: 100 }),
  ],
  validate,
  ctrl.updateProfile
);

router.patch(
  '/status',
  restrictTo('provider'),
  [body('isOnline').isBoolean().withMessage('isOnline must be boolean')],
  validate,
  ctrl.setOnlineStatus
);

router.patch(
  '/location',
  restrictTo('provider'),
  [
    body('lat').isFloat().withMessage('Valid lat required'),
    body('lng').isFloat().withMessage('Valid lng required'),
  ],
  validate,
  ctrl.updateLocation
);

router.post(
  '/documents',
  restrictTo('provider'),
  uploadLimiter,
  uploadDocument,
  handleUploadError,
  [
    body('docType').notEmpty().withMessage('docType required'),
  ],
  validate,
  ctrl.uploadDocument
);

router.get('/:id/reviews', ctrl.getProviderReviews);

module.exports = router;