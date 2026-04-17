const router   = require('express').Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/chat.controller');
const { protect }                              = require('../middleware/auth');
const validate                                 = require('../middleware/validate');
const { uploadMessage, handleUploadError }     = require('../middleware/upload');
const { uploadLimiter }                        = require('../middleware/rateLimiter');

router.use(protect);

router.get('/conversations',             ctrl.getConversations);
router.get('/order/:orderId',            ctrl.getOrCreateChat);
router.get('/:chatId/messages',          ctrl.getMessages);

router.post(
  '/:chatId/messages',
  [
    body('type')
      .optional()
      .isIn(['text', 'location'])
      .withMessage('Invalid type'),
    body('content').notEmpty().withMessage('Content required'),
  ],
  validate,
  ctrl.sendMessage
);

router.post(
  '/:chatId/media',
  uploadLimiter,
  uploadMessage,
  handleUploadError,
  ctrl.sendMediaMessage
);

module.exports = router;