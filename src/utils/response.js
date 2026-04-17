const mapStatusToCode = (status) => {
  const map = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    402: 'PAYMENT_DECLINED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    422: 'VALIDATION_FAILED',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
  };
  return map[status] || 'ERROR';
};

const success = (res, data = {}, message = 'success', statusCode = 200, meta = null) => {
  const payload = { success: true, message, data };
  if (meta) payload.meta = meta;
  return res.status(statusCode).json(payload);
};

const error = (res, message = 'error', statusCode = 500, details = null, code = null) => {
  const payload = {
    success: false,
    error: {
      code: code || mapStatusToCode(statusCode),
      message,
    },
  };
  if (details) payload.error.details = details;
  return res.status(statusCode).json(payload);
};

const paginate = (page, limit, total) => ({
  pagination: {
    page: Number(page),
    limit: Number(limit),
    total,
    pages: Math.ceil(total / limit) || 1,
    hasNext: page * limit < total,
    hasPrev: page > 1,
  },
});

module.exports = { success, error, paginate };
