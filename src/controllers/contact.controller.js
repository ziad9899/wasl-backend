const ContactMessage = require('../models/ContactMessage');
const { success, paginate } = require('../utils/response');
const asyncHandler = require('../utils/asyncHandler');
const { BadRequestError, NotFoundError } = require('../errors');

const submitContact = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message, type, locale } = req.body;

  if (!name || !email || !subject || !message) {
    throw new BadRequestError('Missing required fields');
  }

  const msg = await ContactMessage.create({
    name,
    email: email.toLowerCase(),
    phone: phone || '',
    subject,
    message,
    type: type || 'general',
    locale: locale || 'ar',
    ipAddress: req.ip || '',
    userAgent: req.headers['user-agent'] || '',
  });

  return success(res, { id: msg._id }, 'Message received', 201);
});

const listContacts = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;

  const [items, total] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ContactMessage.countDocuments(filter),
  ]);

  return success(res, { items }, 'success', 200, paginate(page, limit, total));
});

const updateContactStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['new', 'read', 'replied', 'archived'].includes(status)) {
    throw new BadRequestError('Invalid status');
  }
  const msg = await ContactMessage.findByIdAndUpdate(
    req.params.id,
    {
      status,
      ...(status === 'replied' && { repliedAt: new Date(), repliedBy: req.admin?._id }),
    },
    { new: true }
  );
  if (!msg) throw new NotFoundError('Contact message');
  return success(res, { message: msg });
});

module.exports = { submitContact, listContacts, updateContactStatus };
