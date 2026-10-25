const { createMasterRouter, validateProduct } = require('../lib/accountingMaster');
module.exports = createMasterRouter({ model: 'accountProduct', entityType: 'account_product',
  validate: validateProduct, filters: ['category', 'productType'] });
