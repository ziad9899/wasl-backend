const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/bid.controller');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const idempotency = require('../middleware/idempotency');

router.use(protect);

router.post(
  '/',
  restrictTo('provider'),
  idempotency({ required: true }),
  [
    body('orderId').isMongoId(),
    body('price').isInt({ min: 100 }),
    body('arrivalTime').optional().isInt({ min: 1, max: 240 }),
    body('note').optional().isLength({ max: 500 }),
  ],
  validate,
  ctrl.submitBid
);

router.get('/order/:orderId', restrictTo('client', 'admin'), ctrl.getOrderBids);

router.patch(
  '/:id/accept',
  restrictTo('client'),
  idempotency({ required: true }),
  ctrl.acceptBid
);
router.patch('/:id/reject', restrictTo('client'), ctrl.rejectBid);

module.exports = router;
