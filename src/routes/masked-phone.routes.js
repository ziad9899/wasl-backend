const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/masked-phone.controller');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const idempotency = require('../middleware/idempotency');

router.use(protect);

router.post(
  '/session',
  idempotency({ required: false, ttl: 3600 }),
  [body('orderId').isMongoId()],
  validate,
  ctrl.requestSession
);

module.exports = router;
