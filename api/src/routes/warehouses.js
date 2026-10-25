const { createMasterRouter, validateWarehouse } = require('../lib/accountingMaster');
module.exports = createMasterRouter({ model: 'warehouse', entityType: 'warehouse', validate: validateWarehouse });
