require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const hpp = require('hpp');

const connectDB = require('./src/config/database');
const { connectRedis } = require('./src/config/redis');
const { initFirebase } = require('./src/config/firebase');
const { initSocket } = require('./src/socket/socket.handler');
const logger = require('./src/utils/logger');
const setLanguage = require('./src/middleware/language');
const correlationId = require('./src/middleware/correlationId');
const { globalLimiter } = require('./src/middleware/rateLimiter');
const { notFound, globalErrorHandler } = require('./src/middleware/errorHandler');
const ledgerService = require('./src/services/ledger.service');
const { restoreBroadcastsOnBoot } = require('./src/services/broadcasting.service');

const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const providerRoutes = require('./src/routes/provider.routes');
const orderRoutes = require('./src/routes/order.routes');
const bidRoutes = require('./src/routes/bid.routes');
const chatRoutes = require('./src/routes/chat.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const reviewRoutes = require('./src/routes/review.routes');
const notificationRoutes = require('./src/routes/notification.routes');
const adminRoutes = require('./src/routes/admin.routes');
const adminAuthRoutes = require('./src/routes/admin.auth.routes');
const catalogRoutes = require('./src/routes/catalog.routes');
const referralRoutes = require('./src/routes/referral.routes');
const maskedPhoneRoutes = require('./src/routes/masked-phone.routes');
const dsrRoutes = require('./src/routes/dsr.routes');

const { setIo: setOrderIo } = require('./src/controllers/order.controller');
const { setIo: setBidIo } = require('./src/controllers/bid.controller');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
});

app.set('trust proxy', 1);

app.use(correlationId);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept-Language', 'Idempotency-Key', 'X-Request-Id', 'X-Device-Fingerprint'],
  credentials: true,
}));

app.use(compression());
app.use(express.json({ limit: '500kb' }));
app.use(express.urlencoded({ extended: true, limit: '500kb' }));
app.use(mongoSanitize());
app.use(hpp());
app.use(setLanguage);

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.info(msg.trim()) },
  }));
}

app.use('/api', globalLimiter);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'wasl-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health/deep', async (req, res) => {
  const mongoose = require('mongoose');
  const mongoOk = mongoose.connection.readyState === 1;
  let redisOk = false;
  try {
    const { getRedis } = require('./src/config/redis');
    const r = getRedis();
    await r.ping();
    redisOk = true;
  } catch (_) { redisOk = false; }
  const healthy = mongoOk && redisOk;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    components: { mongo: mongoOk, redis: redisOk },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/referral', referralRoutes);
app.use('/api/masked-phone', maskedPhoneRoutes);
app.use('/api/dsr', dsrRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFound);
app.use(globalErrorHandler);

initSocket(io);
setOrderIo(io);
setBidIo(io);

const startServer = async () => {
  try {
    await connectDB();

    try {
      await connectRedis();
    } catch (err) {
      logger.warn('Redis not available — continuing without cache/queues (limited mode)');
    }

    try {
      initFirebase();
    } catch (err) {
      logger.warn('Firebase not initialized — push notifications disabled');
    }

    try {
      await ledgerService.ensureSystemAccounts();
      logger.info('Ledger system accounts ensured');
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to ensure ledger system accounts');
    }

    if (process.env.AUTO_SEED === 'true' || process.env.NODE_ENV === 'production') {
      try {
        const Admin = require('./src/models/Admin');
        const existingAdmin = await Admin.findOne({});
        if (!existingAdmin) {
          const argon2 = require('argon2');
          const email = (process.env.SEED_ADMIN_EMAIL || 'admin@wasl.sa').toLowerCase();
          const password = process.env.SEED_ADMIN_PASSWORD || 'Wasl@2026!';
          const passwordHash = await argon2.hash(password, {
            type: argon2.argon2id,
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1,
          });
          await Admin.create({
            name: 'Super Admin',
            email,
            passwordHash,
            isSuperAdmin: true,
            permissions: [],
            status: 'active',
          });
          logger.info(`Auto-seed: super admin created (${email})`);
        }

        const Config = require('./src/models/Config');
        const { CONFIG_KEYS } = require('./src/constants');
        const DEFAULT_CONFIGS = [
          { key: CONFIG_KEYS.SERVICE_RADIUS, value: 10, type: 'number', category: 'geo' },
          { key: CONFIG_KEYS.WORKING_HOURS, value: { start: '06:00', end: '23:00' }, type: 'object', category: 'ops' },
          { key: CONFIG_KEYS.COMMISSION_RATE, value: 10, type: 'number', category: 'pricing' },
          { key: CONFIG_KEYS.ORDER_ACCEPTANCE_WINDOW, value: 60, type: 'number', category: 'ops' },
          { key: CONFIG_KEYS.DISTANCE_FEE_PER_KM, value: 0, type: 'number', category: 'pricing' },
          { key: CONFIG_KEYS.MIN_RATING_THRESHOLD, value: 2, type: 'number', category: 'ops' },
          { key: CONFIG_KEYS.PAYMENT_METHODS, value: { cash: true, card: true, wallet: true, tabby: true, apple_pay: true }, type: 'object', category: 'payment' },
          { key: CONFIG_KEYS.MAINTENANCE_MODE, value: false, type: 'boolean', category: 'ops' },
          { key: CONFIG_KEYS.REFERRAL_BONUS, value: 0, type: 'number', category: 'pricing' },
          { key: CONFIG_KEYS.MAX_BIDS_PER_ORDER, value: 10, type: 'number', category: 'ops' },
          { key: CONFIG_KEYS.MAX_BROADCAST_ATTEMPTS, value: 5, type: 'number', category: 'ops' },
          { key: CONFIG_KEYS.MIN_WITHDRAWAL, value: 10000, type: 'number', category: 'payment' },
          { key: CONFIG_KEYS.MAX_WITHDRAWAL_PER_DAY, value: 500000, type: 'number', category: 'payment' },
          { key: CONFIG_KEYS.BID_EXPIRY_MINUTES, value: 10, type: 'number', category: 'ops' },
        ];
        for (const c of DEFAULT_CONFIGS) {
          await Config.findOneAndUpdate({ key: c.key }, c, { upsert: true, new: true });
        }
      } catch (err) {
        logger.error({ err: err.message }, 'Auto-seed failed (non-fatal)');
      }
    }

    try {
      await restoreBroadcastsOnBoot(io);
    } catch (err) {
      logger.warn({ err: err.message }, 'Broadcast restore failed');
    }

    const PORT = process.env.PORT || 5000;

    server.listen(PORT, () => {
      logger.info(`WASL server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      setTimeout(() => {
        logger.error('Forced shutdown after 10s');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (err) => {
      logger.error({ err: err?.message, stack: err?.stack }, 'Unhandled Rejection');
    });

    process.on('uncaughtException', (err) => {
      logger.error({ err: err.message, stack: err.stack }, 'Uncaught Exception');
      process.exit(1);
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Server startup failed');
    process.exit(1);
  }
};

startServer();

module.exports = { app, server, io };
