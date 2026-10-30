const { createMasterRouter, validateUnit } = require('../lib/accountingMaster');
module.exports = createMasterRouter({ model: 'accountUnit', entityType: 'account_unit',
  validate: validateUnit, allowPermanent: false });
