const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

const record = async ({
  actorType = 'system',
  actorId = null,
  action,
  targetType,
  targetId = null,
  diff = {},
  ipAddress = '',
  userAgent = '',
  correlationId = '',
}) => {
  try {
    return await AuditLog.create({
      actorType,
      actorId,
      action,
      targetType,
      targetId,
      diff,
      ipAddress,
      userAgent,
      correlationId,
    });
  } catch (err) {
    logger.error({ err: err.message, action }, 'Audit record failed');
  }
};

module.exports = { record };
