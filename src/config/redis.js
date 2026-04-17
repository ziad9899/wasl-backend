const Redis = require('ioredis');

let redis;

const connectRedis = () => {
  redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    lazyConnect: true,
  });

  redis.on('connect',      () => console.log('Redis connected'));
  redis.on('error',  (err) => console.error('Redis error:', err.message));

  return redis;
};

const getRedis = () => {
  if (!redis) throw new Error('Redis not initialized');
  return redis;
};

module.exports = { connectRedis, getRedis };