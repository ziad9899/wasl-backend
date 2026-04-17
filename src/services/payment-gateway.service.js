const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { hmacSha256, timingSafeEqual } = require('../utils/hash');
const { IntegrationError, ForbiddenError } = require('../errors');

const MOYASAR_STUB = !process.env.MOYASAR_SECRET_KEY || process.env.MOYASAR_STUB === 'true';
const TABBY_STUB = !process.env.TABBY_SECRET_KEY || process.env.TABBY_STUB === 'true';

const moyasarCreateCheckout = async ({ amountHalalas, description, userId, orderId = null, returnUrl, metadata = {} }) => {
  if (MOYASAR_STUB) {
    const sessionId = `moyasar-stub-${crypto.randomUUID()}`;
    logger.info({ sessionId, amountHalalas }, 'Moyasar stub checkout created');
    return {
      sessionId,
      checkoutUrl: `${process.env.STUB_CHECKOUT_BASE || 'https://stub.wasl.sa'}/moyasar/${sessionId}`,
      provider: 'moyasar',
      stub: true,
    };
  }

  try {
    const response = await axios.post(
      'https://api.moyasar.com/v1/invoices',
      {
        amount: amountHalalas,
        currency: 'SAR',
        description,
        callback_url: returnUrl,
        metadata: { userId: String(userId), orderId: orderId ? String(orderId) : '', ...metadata },
      },
      {
        auth: { username: process.env.MOYASAR_SECRET_KEY, password: '' },
        timeout: 10000,
      }
    );
    return {
      sessionId: response.data.id,
      checkoutUrl: response.data.url,
      provider: 'moyasar',
    };
  } catch (err) {
    logger.error({ err: err.message }, 'Moyasar checkout failed');
    throw new IntegrationError('Payment gateway unavailable');
  }
};

const moyasarVerifyWebhook = (rawBody, signature) => {
  if (MOYASAR_STUB) return true;
  if (!signature) return false;
  const secret = process.env.MOYASAR_WEBHOOK_SECRET;
  const expected = hmacSha256(rawBody, secret);
  return timingSafeEqual(expected, signature);
};

const tabbyCreateCheckout = async ({ amountHalalas, orderId, userId, buyer, items = [], returnUrl, cancelUrl }) => {
  if (TABBY_STUB) {
    const sessionId = `tabby-stub-${crypto.randomUUID()}`;
    logger.info({ sessionId, amountHalalas, orderId }, 'Tabby stub checkout created');
    return {
      sessionId,
      checkoutUrl: `${process.env.STUB_CHECKOUT_BASE || 'https://stub.wasl.sa'}/tabby/${sessionId}`,
      provider: 'tabby',
      stub: true,
    };
  }

  try {
    const response = await axios.post(
      'https://api.tabby.sa/api/v2/checkout',
      {
        payment: {
          amount: (amountHalalas / 100).toFixed(2),
          currency: 'SAR',
          buyer,
          order: {
            reference_id: String(orderId),
            items,
          },
        },
        merchant_code: process.env.TABBY_MERCHANT_CODE,
        lang: 'ar',
        merchant_urls: { success: returnUrl, cancel: cancelUrl, failure: cancelUrl },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TABBY_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    return {
      sessionId: response.data.id,
      checkoutUrl: response.data.configuration?.available_products?.installments?.[0]?.web_url,
      provider: 'tabby',
    };
  } catch (err) {
    logger.error({ err: err.message }, 'Tabby checkout failed');
    throw new IntegrationError('Tabby gateway unavailable');
  }
};

const tabbyVerifyWebhook = (rawBody, signature) => {
  if (TABBY_STUB) return true;
  if (!signature) return false;
  const secret = process.env.TABBY_WEBHOOK_SECRET;
  const expected = hmacSha256(rawBody, secret);
  return timingSafeEqual(expected, signature);
};

const TABBY_ALLOWED_IPS = new Set([
  '34.166.36.90',
  '34.166.35.211',
  '34.166.34.222',
  '34.166.37.207',
  '34.93.76.191',
  '34.166.128.182',
  '34.166.170.3',
  '34.166.249.7',
]);

const checkTabbyIp = (req) => {
  if (TABBY_STUB) return true;
  const ip = req.ip || req.connection?.remoteAddress;
  return TABBY_ALLOWED_IPS.has(ip);
};

const simulateWebhookFromStub = async ({ provider, sessionId, success = true }) => {
  return {
    provider,
    event: success ? 'payment.captured' : 'payment.failed',
    sessionId,
    status: success ? 'captured' : 'failed',
  };
};

module.exports = {
  moyasarCreateCheckout,
  moyasarVerifyWebhook,
  tabbyCreateCheckout,
  tabbyVerifyWebhook,
  checkTabbyIp,
  simulateWebhookFromStub,
  MOYASAR_STUB,
  TABBY_STUB,
};
