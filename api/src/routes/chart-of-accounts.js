const { createMasterRouter, validateAccount } = require('../lib/accountingMaster');
module.exports = createMasterRouter({ model: 'chartOfAccount', entityType: 'chart_of_account',
  validate: validateAccount, filters: ['category', 'accountType', 'accountMapping'] });
