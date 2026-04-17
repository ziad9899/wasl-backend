const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/order.controller');
const { protect, restrictTo, requireActiveUser } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { uploadOrderPhoto, handleUploadError } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const idempotency = require('../middleware/idempotency');
const { SERVICE_CATEGORY_LIST, ORDER_STATUS_LIST } = require('../constants');

router.use(protect);

router.post(
  '/',
  restrictTo('client'),
  requireActiveUser,
  idempotency({ required: true }),
  [
    body('serviceCategory')
      .optional()
      .isIn(SERVICE_CATEGORY_LIST)
      .withMessage('Invalid service category'),
    body('lat').isFloat({ min: 15, max: 33 }),
    body('lng').isFloat({ min: 33, max: 55 }),
    body('paymentMethod').isIn(['wallet', 'card', 'apple_pay', 'tabby', 'cash']),
    body('items').optional().isArray({ min: 1, max: 5 }),
    body('couponCode').optional().isLength({ min: 3, max: 32 }),
    body('notes').optional().isLength({ max: 500 }),
  ],
  validate,
  ctrl.createOrder
);

router.get('/my', restrictTo('client'), ctrl.getMyOrders);
router.get('/provider/my', restrictTo('provider'), ctrl.getProviderOrders);
router.get('/:id', ctrl.getOrderById);
router.get('/:id/timeline', ctrl.getTimeline);
router.get('/:id/providers', restrictTo('client'), ctrl.getNearbyProviders);

router.patch('/:id/accept', restrictTo('provider'), ctrl.acceptOrder);
router.patch('/:id/reject', restrictTo('provider'), ctrl.rejectOrder);

router.patch(
  '/:id/status',
  [body('status').isIn(ORDER_STATUS_LIST)],
  validate,
  ctrl.updateOrderStatus
);

router.post(
  '/:id/photos',
  restrictTo('provider'),
  uploadLimiter,
  uploadOrderPhoto,
  handleUploadError,
  [body('phase').isIn(['before', 'after'])],
  validate,
  ctrl.uploadOrderPhotos
);

router.patch(
  '/:id/price',
  restrictTo('provider'),
  [body('price').isInt({ min: 100 })],
  validate,
  ctrl.setAgreedPrice
);

router.patch(
  '/:id/confirm-cash',
  restrictTo('provider'),
  ctrl.confirmCashReceipt
);

module.exports = router;
