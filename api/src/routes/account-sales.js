const { createMasterRouter } = require('../lib/accountingMaster');
const { validateSale } = require('../lib/accountCustomers');
module.exports = createMasterRouter({ model: 'accountSale', entityType: 'account_sale', validate: validateSale });
