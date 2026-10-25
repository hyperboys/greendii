const { createMasterRouter, validateSupplier, SUPPLIER_INCLUDE } = require('../lib/accountingMaster');
module.exports = createMasterRouter({ model: 'supplier', entityType: 'supplier', validate: validateSupplier,
  include: SUPPLIER_INCLUDE, fields: ['code', 'name', 'taxId', 'contactPerson'], filters: ['supplierType'] });
