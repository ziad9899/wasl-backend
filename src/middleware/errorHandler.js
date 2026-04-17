const logger = require('../utils/logger');
const { error } = require('../utils/response');
const { DomainError } = require('../errors');

const notFound = (req, res) => error(res, `Route not found: ${req.method} ${req.originalUrl}`, 404);

const globalErrorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const correlationId = req.correlationId || null;

  if (err instanceof DomainError) {
    logger.warn({ correlationId, code: err.code, path: req.originalUrl }, err.message);
    return error(res, err.message, err.statusCode, err.details, err.code);
  }

  if (err.name === 'ValidationError' && err.errors) {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return error(res, 'Validation failed', 422, details, 'VALIDATION_FAILED');
  }

  if (err.name === 'CastError') {
    return error(res, `Invalid ${err.path}: ${err.value}`, 400);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return error(res, `Duplicate value for ${field}`, 409, null, 'DUPLICATE_KEY');
  }

  if (err.name === 'TokenExpiredError') return error(res, 'Token expired', 401);
  if (err.name === 'JsonWebTokenError') return error(res, 'Invalid token', 401);

  if (err.type === 'entity.too.large') return error(res, 'Payload too large', 413);

  logger.error(
    { correlationId, stack: err.stack, path: req.originalUrl, method: req.method },
    err.message || 'Unhandled error'
  );

  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message || 'Internal server error';

  return error(res, message, 500);
};

module.exports = { notFound, globalErrorHandler };
