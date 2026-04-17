class DomainError extends Error {
  constructor(message, statusCode = 500, code = 'DOMAIN_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends DomainError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 422, 'VALIDATION_FAILED', details);
  }
}

class NotFoundError extends DomainError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class AuthError extends DomainError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends DomainError {
  constructor(message = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends DomainError {
  constructor(message = 'Conflict') {
    super(message, 409, 'CONFLICT');
  }
}

class PaymentError extends DomainError {
  constructor(message = 'Payment failed', details = null) {
    super(message, 402, 'PAYMENT_DECLINED', details);
  }
}

class RateLimitError extends DomainError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMITED');
  }
}

class ServiceUnavailableError extends DomainError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

class BadRequestError extends DomainError {
  constructor(message = 'Bad request', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

class IntegrationError extends DomainError {
  constructor(message = 'External integration failure', details = null) {
    super(message, 502, 'BAD_GATEWAY', details);
  }
}

module.exports = {
  DomainError,
  ValidationError,
  NotFoundError,
  AuthError,
  ForbiddenError,
  ConflictError,
  PaymentError,
  RateLimitError,
  ServiceUnavailableError,
  BadRequestError,
  IntegrationError,
};
