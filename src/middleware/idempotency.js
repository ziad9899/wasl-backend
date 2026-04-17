const { getRedis } = require('../config/redis');
const { sha256 } = require('../utils/hash');
const logger = require('../utils/logger');
const { error } = require('../utils/response');

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;
const PROCESSING_TTL_SECONDS = 60;

const idempotency = (options = {}) => {
  const required = options.required !== false;
  const ttl = options.ttl || IDEMPOTENCY_TTL_SECONDS;

  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];

    if (!key) {
      if (required) return error(res, 'Idempotency-Key header is required', 400, null, 'IDEMPOTENCY_KEY_MISSING');
      return next();
    }

    if (!/^[a-zA-Z0-9\-_]{8,128}$/.test(key)) {
      return error(res, 'Invalid Idempotency-Key format', 400, null, 'IDEMPOTENCY_KEY_INVALID');
    }

    const userId = req.user?._id?.toString() || 'anon';
    const redisKey = `idem:${userId}:${key}`;
    const fingerprint = sha256(JSON.stringify(req.body || {}));

    let redis;
    try {
      redis = getRedis();
    } catch (_) {
      logger.warn('Redis unavailable — idempotency check skipped');
      return next();
    }

    try {
      const existing = await redis.get(redisKey);
      if (existing) {
        const parsed = JSON.parse(existing);
        if (parsed.fingerprint !== fingerprint) {
          return error(
            res,
            'Idempotency-Key reused with different request body',
            409,
            null,
            'IDEMPOTENCY_KEY_CONFLICT'
          );
        }
        if (parsed.status === 'processing') {
          return error(res, 'A request with this key is still being processed', 409, null, 'IDEMPOTENCY_IN_PROGRESS');
        }
        res.status(parsed.statusCode).json(parsed.body);
        return;
      }

      await redis.set(
        redisKey,
        JSON.stringify({ status: 'processing', fingerprint, startedAt: Date.now() }),
        'EX',
        PROCESSING_TTL_SECONDS,
        'NX'
      );

      const originalJson = res.json.bind(res);
      res.json = (body) => {
        const statusCode = res.statusCode;
        if (statusCode < 500) {
          redis
            .set(
              redisKey,
              JSON.stringify({ status: 'completed', fingerprint, statusCode, body }),
              'EX',
              ttl
            )
            .catch((err) => logger.error({ err }, 'Failed to cache idempotent response'));
        } else {
          redis.del(redisKey).catch(() => {});
        }
        return originalJson(body);
      };

      next();
    } catch (err) {
      logger.error({ err }, 'Idempotency middleware error');
      next();
    }
  };
};

module.exports = idempotency;
