const crypto = require('crypto');

const correlationId = (req, res, next) => {
  const incoming = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  const id = incoming && /^[a-zA-Z0-9\-_]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.correlationId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

module.exports = correlationId;
