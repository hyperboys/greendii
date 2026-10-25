const router = require('express').Router();

router.use('/delivery-orders', require('./delivery-orders'));
router.use('/invoices', require('./invoices'));
router.use('/billing-notes', require('./billing-notes'));
router.use('/credit-notes', require('./credit-notes'));
router.use('/receipt-vouchers', require('./receipt-vouchers'));

module.exports = router;
