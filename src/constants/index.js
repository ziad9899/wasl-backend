const SERVICE_CATEGORIES = Object.freeze({
  CAR_WASH: 'car_wash',
  APPLIANCE_REPAIR: 'appliance_repair',
  HOME_MAINTENANCE: 'home_maintenance',
  CLEANING: 'cleaning',
  MOVING: 'moving',
  PEST_CONTROL: 'pest_control',
});

const SERVICE_CATEGORY_LIST = Object.values(SERVICE_CATEGORIES);

const FIXED_PRICE_CATEGORIES = Object.freeze([SERVICE_CATEGORIES.CAR_WASH]);

const ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  BROADCASTING: 'broadcasting',
  ACCEPTED: 'accepted',
  ON_THE_WAY: 'on_the_way',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_PROVIDERS: 'no_providers',
});

const ORDER_STATUS_LIST = Object.values(ORDER_STATUS);

const ORDER_TERMINAL_STATES = Object.freeze([
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.NO_PROVIDERS,
]);

const PAYMENT_METHODS = Object.freeze({
  WALLET: 'wallet',
  CARD: 'card',
  APPLE_PAY: 'apple_pay',
  TABBY: 'tabby',
  CASH: 'cash',
});

const PAYMENT_METHOD_LIST = Object.values(PAYMENT_METHODS);

const PAYMENT_STATUS = Object.freeze({
  UNPAID: 'unpaid',
  AUTHORIZED: 'authorized',
  CAPTURED: 'captured',
  REFUNDED: 'refunded',
  SETTLED: 'settled',
  FAILED: 'failed',
});

const USER_ROLES = Object.freeze({
  CLIENT: 'client',
  PROVIDER: 'provider',
  ADMIN: 'admin',
});

const USER_STATUS = Object.freeze({
  PENDING_PROFILE: 'pending_profile',
  AWAITING_APPROVAL: 'awaiting_approval',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
});

const PROVIDER_APPROVAL = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
});

const ACCOUNT_TYPES = Object.freeze({
  CUSTOMER_WALLET: 'customer_wallet',
  PROVIDER_WALLET: 'provider_wallet',
  PROVIDER_COMMISSION_DEBT: 'provider_commission_debt',
  PLATFORM_REVENUE: 'platform_revenue',
  PLATFORM_REFUNDS: 'platform_refunds',
  CASH_IN_TRANSIT: 'cash_in_transit',
  PAYMENT_GATEWAY_CLEARING: 'payment_gateway_clearing',
  PAYOUT_PENDING: 'payout_pending',
  REFERRAL_BONUS_POOL: 'referral_bonus_pool',
});

const ACCOUNT_TYPE_LIST = Object.values(ACCOUNT_TYPES);

const SYSTEM_ACCOUNTS = Object.freeze([
  ACCOUNT_TYPES.PLATFORM_REVENUE,
  ACCOUNT_TYPES.PLATFORM_REFUNDS,
  ACCOUNT_TYPES.CASH_IN_TRANSIT,
  ACCOUNT_TYPES.PAYMENT_GATEWAY_CLEARING,
  ACCOUNT_TYPES.PAYOUT_PENDING,
  ACCOUNT_TYPES.REFERRAL_BONUS_POOL,
]);

const TX_KINDS = Object.freeze({
  ORDER_PAYMENT_WALLET: 'order_payment_wallet',
  ORDER_PAYMENT_CARD: 'order_payment_card',
  ORDER_PAYMENT_APPLE_PAY: 'order_payment_apple_pay',
  ORDER_PAYMENT_TABBY: 'order_payment_tabby',
  ORDER_SETTLEMENT_CASH: 'order_settlement_cash',
  CASH_COMMISSION_DEBT: 'cash_commission_debt',
  WALLET_TOPUP: 'wallet_topup',
  WALLET_TOPUP_REFUND: 'wallet_topup_refund',
  WITHDRAWAL_REQUEST: 'withdrawal_request',
  WITHDRAWAL_PAID: 'withdrawal_paid',
  WITHDRAWAL_REJECTED: 'withdrawal_rejected',
  REFUND: 'refund',
  REFERRAL_BONUS: 'referral_bonus',
  COUPON_APPLICATION: 'coupon_application',
  REVERSAL: 'reversal',
});

const NOTIFICATION_TYPES = Object.freeze({
  ORDER_NEW: 'order_new',
  ORDER_ACCEPTED: 'order_accepted',
  ORDER_REJECTED: 'order_rejected',
  ORDER_STATUS_UPDATE: 'order_status_update',
  ORDER_COMPLETED: 'order_completed',
  ORDER_CANCELLED: 'order_cancelled',
  BID_NEW: 'bid_new',
  BID_ACCEPTED: 'bid_accepted',
  BID_REJECTED: 'bid_rejected',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_FAILED: 'payment_failed',
  WITHDRAWAL_PROCESSED: 'withdrawal_processed',
  WITHDRAWAL_REJECTED: 'withdrawal_rejected',
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_SUSPENDED: 'account_suspended',
  ACCOUNT_REACTIVATED: 'account_reactivated',
  REFERRAL_REWARDED: 'referral_rewarded',
  PROMO: 'promo',
  SYSTEM: 'system',
  CHAT_MESSAGE: 'chat_message',
  MASKED_PHONE_READY: 'masked_phone_ready',
});

const CONFIG_KEYS = Object.freeze({
  SERVICE_RADIUS: 'serviceRadius',
  WORKING_HOURS: 'workingHours',
  COMMISSION_RATE: 'commissionRate',
  ORDER_ACCEPTANCE_WINDOW: 'orderAcceptanceWindow',
  DISTANCE_FEE_PER_KM: 'distanceFeePerKm',
  MIN_RATING_THRESHOLD: 'minRatingThreshold',
  PAYMENT_METHODS: 'paymentMethods',
  MAINTENANCE_MODE: 'maintenanceMode',
  REFERRAL_BONUS: 'referralBonus',
  MAX_BIDS_PER_ORDER: 'maxBidsPerOrder',
  MAX_BROADCAST_ATTEMPTS: 'maxBroadcastAttempts',
  MIN_WITHDRAWAL: 'minWithdrawal',
  MAX_WITHDRAWAL_PER_DAY: 'maxWithdrawalPerDay',
  BID_EXPIRY_MINUTES: 'bidExpiryMinutes',
});

const CAR_WASH_VEHICLE_SIZES = Object.freeze(['small', 'medium', 'large']);

const CAR_WASH_TYPES = Object.freeze([
  'exterior_basic',
  'exterior_wax',
  'exterior_wax_double',
  'exterior_plus_interior_basic',
  'exterior_plus_interior_wax',
  'exterior_plus_interior_double',
  'interior_only',
]);

const WITHDRAWAL_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  PROCESSING: 'processing',
  PAID: 'paid',
  REJECTED: 'rejected',
});

const DSR_TYPES = Object.freeze({
  EXPORT: 'export',
  ERASURE: 'erasure',
  RECTIFICATION: 'rectification',
  CONSENT_WITHDRAWAL: 'consent_withdrawal',
});

const DSR_STATUS = Object.freeze({
  RECEIVED: 'received',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
});

module.exports = {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_LIST,
  FIXED_PRICE_CATEGORIES,
  ORDER_STATUS,
  ORDER_STATUS_LIST,
  ORDER_TERMINAL_STATES,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LIST,
  PAYMENT_STATUS,
  USER_ROLES,
  USER_STATUS,
  PROVIDER_APPROVAL,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LIST,
  SYSTEM_ACCOUNTS,
  TX_KINDS,
  NOTIFICATION_TYPES,
  CONFIG_KEYS,
  CAR_WASH_VEHICLE_SIZES,
  CAR_WASH_TYPES,
  WITHDRAWAL_STATUS,
  DSR_TYPES,
  DSR_STATUS,
};
