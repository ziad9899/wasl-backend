const router = require('express').Router();
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/contact.controller');
const validate = require('../middleware/validate');

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/',
  contactLimiter,
  [
    body('name').trim().isLength({ min: 2, max: 100 }),
    body('email').isEmail().normalizeEmail(),
    body('phone').optional().isLength({ max: 30 }),
    body('subject').trim().isLength({ min: 2, max: 200 }),
    body('message').trim().isLength({ min: 10, max: 3000 }),
    body('type').optional().isIn(['general', 'provider', 'support', 'partnership']),
    body('locale').optional().isIn(['ar', 'en']),
  ],
  validate,
  ctrl.submitContact
);

module.exports = router;
