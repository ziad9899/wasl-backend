const maskedPhoneService = require('../services/masked-phone.service');
const { success } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');

const requestSession = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  const session = await maskedPhoneService.createSessionForOrder({
    orderId,
    requesterId: req.user._id,
  });
  return success(res, session, 'Masked phone session created', 201);
});

module.exports = { requestSession };
