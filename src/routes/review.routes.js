const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/review.controller');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

router.use(protect);

router.post(
  '/',
  [
    body('orderId').isMongoId(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').optional().isLength({ max: 1000 }),
  ],
  validate,
  ctrl.submitReview
);

router.get('/user/:userId', ctrl.getUserReviews);

module.exports = router;
