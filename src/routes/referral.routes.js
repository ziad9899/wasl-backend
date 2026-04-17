const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/referral.controller');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.get('/my-code', ctrl.getMyCode);
router.get('/my-list', ctrl.getMyReferrals);

router.post(
  '/redeem',
  [body('code').notEmpty().isLength({ min: 4, max: 16 })],
  validate,
  ctrl.redeem
);

module.exports = router;
