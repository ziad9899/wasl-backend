const router = require('express').Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/admin.controller');
const { protectAdmin } = require('../middleware/adminAuth');
const validate = require('../middleware/validate');
const { recordAudit } = require('../middleware/auditLog');

router.use(protectAdmin);

router.get('/dashboard/stats', ctrl.getDashboardStats);

router.get('/users', ctrl.getAllUsers);
router.get('/users/:id', ctrl.getUserById);
router.patch('/users/:id/suspend', recordAudit('user.suspend', 'User'), ctrl.suspendUser);
router.patch('/users/:id/activate', recordAudit('user.activate', 'User'), ctrl.activateUser);

router.get('/providers/pending', ctrl.getPendingProviders);
router.patch('/providers/:id/approve', recordAudit('provider.approve', 'Provider'), ctrl.approveProvider);
router.patch('/providers/:id/reject', recordAudit('provider.reject', 'Provider'), ctrl.rejectProvider);
router.patch(
  '/providers/:id/documents/verify',
  [body('docType').notEmpty(), body('verified').isBoolean()],
  validate,
  recordAudit('provider.document.verify', 'Provider'),
  ctrl.verifyProviderDocument
);

router.get('/orders', ctrl.getAllOrders);
router.patch(
  '/orders/:id/force-cancel',
  [body('reason').notEmpty().isLength({ min: 3, max: 500 })],
  validate,
  recordAudit('order.force_cancel', 'Order'),
  ctrl.forceCancelOrder
);
router.post(
  '/orders/:id/refund',
  [body('reason').notEmpty(), body('amount').optional().isInt({ min: 1 })],
  validate,
  recordAudit('order.refund', 'Order'),
  ctrl.refundOrder
);

router.get('/reports/revenue', ctrl.getRevenueReport);
router.get('/reports/providers-performance', ctrl.getProvidersPerformance);
router.get('/reports/trial-balance', ctrl.getTrialBalance);
router.get('/reports/ledger/:accountId', ctrl.getLedgerStatement);

router.get('/withdrawals', ctrl.getWithdrawals);
router.patch('/withdrawals/:id/approve', recordAudit('withdrawal.approve', 'WithdrawalRequest'), ctrl.approveWithdrawal);
router.patch(
  '/withdrawals/:id/reject',
  [body('reason').notEmpty()],
  validate,
  recordAudit('withdrawal.reject', 'WithdrawalRequest'),
  ctrl.rejectWithdrawal
);

router.get('/reviews', ctrl.getAllReviews);
router.delete(
  '/reviews/:id',
  [body('reason').optional().isLength({ max: 500 })],
  validate,
  recordAudit('review.delete', 'Review'),
  ctrl.deleteReview
);

router.get('/coupons', ctrl.getCoupons);
router.post(
  '/coupons',
  [
    body('code').notEmpty(),
    body('discountType').isIn(['percentage', 'fixed']),
    body('discountValue').isFloat({ min: 0 }),
  ],
  validate,
  recordAudit('coupon.create', 'Coupon'),
  ctrl.createCoupon
);
router.put('/coupons/:id', recordAudit('coupon.update', 'Coupon'), ctrl.updateCoupon);
router.patch('/coupons/:id/toggle', recordAudit('coupon.toggle', 'Coupon'), ctrl.toggleCoupon);
router.delete('/coupons/:id', recordAudit('coupon.delete', 'Coupon'), ctrl.deleteCoupon);

router.get('/configs', ctrl.getConfigs);
router.put(
  '/configs',
  [body('key').notEmpty(), body('value').exists()],
  validate,
  recordAudit('config.update', 'Config'),
  ctrl.updateConfig
);

router.post(
  '/notifications/broadcast',
  [
    body('title_ar').notEmpty(),
    body('title_en').notEmpty(),
    body('body_ar').notEmpty(),
    body('body_en').notEmpty(),
  ],
  validate,
  recordAudit('notification.broadcast', 'Notification'),
  ctrl.sendBroadcastNotification
);

router.get('/audit-logs', ctrl.getAuditLogs);

router.get('/dsr', ctrl.getDsrRequests);
router.patch(
  '/dsr/:id/process',
  [body('action').isIn(['approve', 'reject'])],
  validate,
  recordAudit('dsr.process', 'DSRRequest'),
  ctrl.processDsr
);

router.get('/fraud-flags', ctrl.listFraudFlags);
router.patch(
  '/fraud-flags/:id/resolve',
  recordAudit('fraud.resolve', 'FraudFlag'),
  ctrl.resolveFraudFlag
);

router.get('/catalog/banners', ctrl.listBanners);
router.post(
  '/catalog/banners',
  [
    body('title_ar').notEmpty(),
    body('title_en').notEmpty(),
    body('image_ar').notEmpty(),
    body('image_en').notEmpty(),
  ],
  validate,
  recordAudit('banner.create', 'Banner'),
  ctrl.createBanner
);
router.put('/catalog/banners/:id', recordAudit('banner.update', 'Banner'), ctrl.updateBanner);
router.delete('/catalog/banners/:id', recordAudit('banner.delete', 'Banner'), ctrl.deleteBanner);

router.get('/catalog/subcategories', ctrl.listSubCategories);
router.post(
  '/catalog/subcategories',
  [
    body('parent').notEmpty(),
    body('keyAr').notEmpty(),
    body('keyEn').notEmpty(),
    body('slug').notEmpty(),
  ],
  validate,
  recordAudit('subcategory.create', 'ServiceSubCategory'),
  ctrl.createSubCategory
);
router.put('/catalog/subcategories/:id', recordAudit('subcategory.update', 'ServiceSubCategory'), ctrl.updateSubCategory);
router.delete('/catalog/subcategories/:id', recordAudit('subcategory.delete', 'ServiceSubCategory'), ctrl.deleteSubCategory);

router.get('/catalog/car-wash-prices', ctrl.listCarWashPrices);
router.post(
  '/catalog/car-wash-prices',
  [
    body('vehicleSize').isIn(['small', 'medium', 'large']),
    body('washType').notEmpty(),
    body('price').isInt({ min: 0 }),
  ],
  validate,
  recordAudit('car_wash_price.create', 'CarWashPrice'),
  ctrl.createCarWashPrice
);
router.put('/catalog/car-wash-prices/:id', recordAudit('car_wash_price.update', 'CarWashPrice'), ctrl.updateCarWashPrice);
router.delete('/catalog/car-wash-prices/:id', recordAudit('car_wash_price.delete', 'CarWashPrice'), ctrl.deleteCarWashPrice);

router.get('/health/reconciliation', ctrl.healthReconciliation);

module.exports = router;
