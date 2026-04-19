const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/payment.controller');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const idempotency = require('../middleware/idempotency');

router.post('/webhooks/tabby', ctrl.tabbyWebhook);
router.post('/webhooks/moyasar', ctrl.moyasarWebhook);

if (process.env.NODE_ENV !== 'production') {
  router.post('/stub/simulate', ctrl.simulatePaymentStub);
}

router.use(protect);

router.post(
  '/coupon/validate',
  [body('code').notEmpty(), body('orderValue').isInt({ min: 0 })],
  validate,
  ctrl.validateCoupon
);

router.post(
  '/wallet/pay',
  restrictTo('client'),
  idempotency({ required: true }),
  [body('orderId').isMongoId()],
  validate,
  ctrl.payWithWallet
);

router.get('/wallet/balance', ctrl.getWalletBalance);
router.get('/wallet/transactions', ctrl.listTransactions);

router.post(
  '/wallet/topup',
  restrictTo('client'),
  idempotency({ required: true }),
  [body('amount').isInt({ min: 1000, max: 500000 })],
  validate,
  ctrl.topupWallet
);

router.post(
  '/wallet/withdraw',
  restrictTo('provider'),
  idempotency({ required: true }),
  [body('amount').isInt({ min: 10000 }), body('otpCode').isLength({ min: 4, max: 4 }).isNumeric()],
  validate,
  ctrl.requestWithdrawal
);

router.post(
  '/checkout/card',
  restrictTo('client'),
  idempotency({ required: true }),
  [body('orderId').isMongoId(), body('paymentMethod').isIn(['card', 'apple_pay'])],
  validate,
  ctrl.checkoutOrderCard
);

router.post(
  '/checkout/tabby',
  restrictTo('client'),
  idempotency({ required: true }),
  [body('orderId').isMongoId()],
  validate,
  ctrl.checkoutOrderTabby
);

module.exports = router;
