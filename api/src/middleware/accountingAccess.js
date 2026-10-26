const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');

const ACCOUNTING_RESOURCES = [
  ['/api/account-customers', 'master'],
  ['/api/account-sales', 'master'],
  ['/api/account-products', 'master'],
  ['/api/suppliers', 'master'],
  ['/api/warehouses', 'master'],
  ['/api/chart-of-accounts', 'master'],
  ['/api/ar', 'ar'],
  ['/api/ap', 'ap'],
  ['/api/inventory', 'inventory'],
  ['/api/accounting-reports', 'reports'],
];

function requireAccountingResource(module) {
  return async (req, res, next) => {
    try {
      // AR Draft management uses the agreed ar.create permission.
      const soDraftEdit = module === 'ar' && req.method === 'PUT' && /^\/(?:delivery-orders|invoices|billing-notes|receipt-vouchers|credit-notes)\/[^/]+\/?$/.test(req.path);
      const apAction = module === 'ap' && req.method === 'POST' && req.path.match(/^\/(?:contractor-payments|payment-vouchers)\/[^/]+\/(submit|approve|return|reject|cancel|pay)\/?$/)?.[1];
      const cqAction = module === 'ap' && req.method === 'PATCH' && /^\/cheque-payments\/[^/]+\/status\/?$/.test(req.path)
        ? { Printed: 'create', Signed: 'approve', Released: 'pay', Cleared: 'pay', Cancelled: 'cancel' }[req.body?.status] : null;
      const action = cqAction || (apAction ? (apAction === 'submit' ? 'create' : apAction === 'cancel' ? 'cancel' : apAction === 'pay' ? 'pay' : 'approve')
        : soDraftEdit ? 'create' : { GET: 'view', HEAD: 'view', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' }[req.method]);
      const access = await getAccountingAccess(req.user);
      if (!action || !hasAccountingPermission(access, module, action)) {
        return res.status(403).json({ message: 'ไม่มีสิทธิ์ดำเนินการใน Accounting กรุณาติดต่อผู้ดูแลระบบ' });
      }
      next();
    } catch (error) { next(error); }
  };
}

module.exports = { ACCOUNTING_RESOURCES, requireAccountingResource };
