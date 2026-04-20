const router   = require('express').Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/provider.controller');
const { protect, restrictTo }               = require('../middleware/auth');
const validate                              = require('../middleware/validate');
const { uploadDocument, handleUploadError } = require('../middleware/upload');
const { uploadLimiter }                     = require('../middleware/rateLimiter');

// ── Authenticated provider routes ─────────────────────────────────────────
// Important: every static path (/profile, /status, /location, /documents)
// MUST be registered before the catch-all /:id below. Express matches by
// declaration order, so /:id would otherwise swallow GET /profile and route
// it to getPublicProvider with id="profile".
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

// ── Dynamic-id routes (must come AFTER all static paths) ──────────────────
// These also stay protected so every fetch is auditable; the public profile
// helper still returns the same data — login wall is no privacy loss but
// gains us per-user rate limits and audit visibility.
router.get('/:id/reviews', ctrl.getProviderReviews);
router.get('/:id', ctrl.getPublicProvider);

module.exports = router;