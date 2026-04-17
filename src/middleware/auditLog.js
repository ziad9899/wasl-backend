const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

const recordAudit = (action, targetType) => (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
      AuditLog.create({
        actorType: req.user.role === 'admin' ? 'admin' : 'user',
        actorId: req.user._id,
        action,
        targetType,
        targetId: req.params.id || body?.data?._id || null,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || '',
        correlationId: req.correlationId || '',
        diff: req.body ? { input: sanitize(req.body) } : {},
      }).catch((err) => logger.error({ err }, 'Audit log write failed'));
    }
    return originalJson(body);
  };
  next();
};

const sanitize = (obj) => {
  const redactKeys = ['password', 'otpCode', 'code', 'token', 'refreshToken', 'iban', 'mfaSecret'];
  const clone = JSON.parse(JSON.stringify(obj));
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (redactKeys.includes(k)) o[k] = '[REDACTED]';
      else if (typeof o[k] === 'object') walk(o[k]);
    }
  };
  walk(clone);
  return clone;
};

module.exports = { recordAudit };
