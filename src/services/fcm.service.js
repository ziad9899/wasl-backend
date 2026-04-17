const { admin }      = require('../config/firebase');
const Notification   = require('../models/Notification');
const User           = require('../models/User');
const logger         = require('../utils/logger');

const NOTIFICATION_TEMPLATES = {
  order_new: {
    title_ar: 'طلب جديد',
    title_en: 'New Order',
    body_ar:  'يوجد طلب جديد في منطقتك',
    body_en:  'There is a new order in your area',
  },
  order_accepted: {
    title_ar: 'تم قبول طلبك',
    title_en: 'Order Accepted',
    body_ar:  'تم قبول طلبك من قِبل مقدم الخدمة',
    body_en:  'Your order has been accepted by a provider',
  },
  order_rejected: {
    title_ar: 'لم يتوفر مقدم خدمة',
    title_en: 'No Provider Available',
    body_ar:  'لم يتوفر مقدم خدمة حالياً. يرجى المحاولة لاحقاً',
    body_en:  'No provider available right now. Please try again later',
  },
  order_status_update: {
    title_ar: 'تحديث حالة الطلب',
    title_en: 'Order Status Update',
    body_ar:  'تم تحديث حالة طلبك',
    body_en:  'Your order status has been updated',
  },
  order_completed: {
    title_ar: 'اكتملت الخدمة',
    title_en: 'Service Completed',
    body_ar:  'تم إنجاز طلبك بنجاح',
    body_en:  'Your service has been completed successfully',
  },
  bid_new: {
    title_ar: 'عرض سعر جديد',
    title_en: 'New Price Offer',
    body_ar:  'تلقيت عرض سعر جديد على طلبك',
    body_en:  'You received a new price offer on your order',
  },
  bid_accepted: {
    title_ar: 'تم قبول عرضك',
    title_en: 'Offer Accepted',
    body_ar:  'قبل العميل عرض السعر الخاص بك',
    body_en:  'The client accepted your price offer',
  },
  payment_received: {
    title_ar: 'تم استلام الدفع',
    title_en: 'Payment Received',
    body_ar:  'تم إضافة المبلغ إلى محفظتك',
    body_en:  'Amount has been added to your wallet',
  },
  account_approved: {
    title_ar: 'تم تفعيل حسابك',
    title_en: 'Account Approved',
    body_ar:  'تم الموافقة على حسابك. يمكنك البدء بتلقي الطلبات',
    body_en:  'Your account has been approved. You can start receiving orders',
  },
  account_suspended: {
    title_ar: 'تم إيقاف حسابك',
    title_en: 'Account Suspended',
    body_ar:  'تم إيقاف حسابك مؤقتاً. تواصل مع الدعم',
    body_en:  'Your account has been suspended. Contact support',
  },
};

const sendToUser = async (userId, type, extraData = {}, customTexts = {}) => {
  try {
    const user = await User.findById(userId).select('deviceTokens language');
    if (!user || !user.deviceTokens.length) return;

    const template = NOTIFICATION_TEMPLATES[type] || {};
    const title_ar = customTexts.title_ar || template.title_ar || 'واصل';
    const title_en = customTexts.title_en || template.title_en || 'WASL';
    const body_ar  = customTexts.body_ar  || template.body_ar  || '';
    const body_en  = customTexts.body_en  || template.body_en  || '';

    await Notification.create({
      userId,
      type,
      title_ar,
      title_en,
      body_ar,
      body_en,
      data: extraData,
    });

    const isAr    = user.language === 'ar';
    const title   = isAr ? title_ar : title_en;
    const body    = isAr ? body_ar  : body_en;

    const message = {
      notification: { title, body },
      data: {
        type,
        ...Object.fromEntries(
          Object.entries(extraData).map(([k, v]) => [k, String(v)])
        ),
      },
      tokens: user.deviceTokens,
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'wasl_main' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    const invalidTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(user.deviceTokens[idx]);
        }
      }
    });

    if (invalidTokens.length) {
      await User.findByIdAndUpdate(userId, {
        $pull: { deviceTokens: { $in: invalidTokens } },
      });
    }
  } catch (err) {
    logger.error(`FCM sendToUser failed for ${userId}:`, err.message);
  }
};

const sendToMany = async (userIds, type, extraData = {}) => {
  await Promise.allSettled(
    userIds.map((id) => sendToUser(id, type, extraData))
  );
};

module.exports = { sendToUser, sendToMany };