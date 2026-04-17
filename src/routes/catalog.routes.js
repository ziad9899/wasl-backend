const router = require('express').Router();
const ctrl = require('../controllers/catalog.controller');

router.get('/banners', ctrl.getBanners);
router.get('/categories', ctrl.getCategories);
router.get('/car-wash-prices', ctrl.getCarWashPrices);
router.get('/config/public', ctrl.getPublicConfig);

module.exports = router;
