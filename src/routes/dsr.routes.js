const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/dsr.controller');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/my', ctrl.listMyRequests);

router.post(
  '/export',
  [body('reason').optional().isLength({ max: 500 })],
  validate,
  ctrl.requestExport
);

router.post(
  '/erasure',
  [
    body('otpCode').isLength({ min: 6, max: 6 }),
    body('reason').optional().isLength({ max: 500 }),
  ],
  validate,
  ctrl.requestErasure
);

router.post('/erasure/cancel', ctrl.cancelErasure);

router.patch(
  '/consent',
  [body('marketing').optional().isBoolean()],
  validate,
  ctrl.updateConsent
);

module.exports = router;
