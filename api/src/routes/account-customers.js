const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { CUSTOMER_INCLUDE, validateCustomer } = require('../lib/accountCustomers');
const { addMasterReads, addMasterDeletes, conflict, lockMaster, audit } = require('../lib/accountingMaster');

router.use(authenticate);
const masterConfig = { model: 'accountCustomer', entityType: 'account_customer', include: CUSTOMER_INCLUDE,
  fields: ['code', 'name', 'taxId', 'contactPerson'] };
addMasterReads(router, masterConfig, prisma);
addMasterDeletes(router, masterConfig, prisma);

async function saveCustomer(req, res, next) {
  try {
    const item = await prisma.$transaction(async tx => {
      if (req.params.id) await lockMaster(tx, 'accountCustomer', req.params.id);
      const previous = req.params.id ? await tx.accountCustomer.findUniqueOrThrow({
        where: { id: req.params.id }, include: CUSTOMER_INCLUDE,
      }) : null;
      if (previous && req.body.updatedAt && new Date(req.body.updatedAt).getTime() !== previous.updatedAt.getTime()) {
        throw Object.assign(new Error('ข้อมูลลูกค้าถูกแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่'), { status: 409 });
      }
      const { branches, secondarySaleIds, ...data } = validateCustomer(req.body, previous);
      const assignedSaleIds = new Set([previous?.responsibleSaleId, ...(previous?.secondarySales || []).map(s => s.saleId)]);
      for (const saleId of [data.responsibleSaleId, ...(secondarySaleIds || [])].filter(Boolean)) {
        const sale = await tx.accountSale.findUnique({ where: { id: saleId } });
        if (!sale || (!sale.active && !assignedSaleIds.has(sale.id))) {
          throw Object.assign(new Error('Sale ผู้ดูแลไม่ถูกต้องหรือถูกปิดใช้งาน'), { status: 400 });
        }
      }
      if (secondarySaleIds) {
        if (previous) await tx.accountCustomerSecondarySale.deleteMany({ where: { customerId: previous.id } });
        data.secondarySales = { create: secondarySaleIds.map((saleId, position) => ({ saleId, position })) };
      }
      if (branches) {
        const branchIds = branches.map(b => b.id).filter(Boolean);
        const addressIds = branches.flatMap(b => b.addresses.map(a => a.id)).filter(Boolean);
        if (new Set(branchIds).size !== branchIds.length || new Set(addressIds).size !== addressIds.length ||
            branches.some(b => (b.id && !previous?.branches.some(old => old.id === b.id)) ||
              b.addresses.some(a => a.id && !previous?.branches.find(old => old.id === b.id)?.addresses.some(old => old.id === a.id)))) {
          throw Object.assign(new Error('รหัสอ้างอิงสาขาหรือที่อยู่ไม่ถูกต้อง กรุณาโหลดข้อมูลใหม่'), { status: 400 });
        }
        if (previous) await tx.accountCustomerBranch.deleteMany({ where: { customerId: previous.id } });
        data.branches = { create: branches.map((branch, position) => ({
          ...(branch.id ? { id: branch.id } : {}), code: branch.code, name: branch.name, position,
          contactPerson: branch.contactPerson, tel: branch.tel, fax: branch.fax, email: branch.email,
          addresses: { create: branch.addresses.map((address, addressPosition) => ({
            ...(address.id ? { id: address.id } : {}), label: address.label, kind: address.kind,
            address: address.address, position: addressPosition,
          })) },
        })) };
      }
      const saved = previous ? await tx.accountCustomer.update({
        where: { id: previous.id }, data, include: CUSTOMER_INCLUDE,
      }) : await tx.accountCustomer.create({ data, include: CUSTOMER_INCLUDE });
      await audit(tx, req, 'account_customer', previous, saved, previous ? 'update' : 'create');
      return saved;
    }, { isolationLevel: 'Serializable' });
    res.status(req.params.id ? 200 : 201).json(item);
  } catch (e) {
    if (e.code === 'P2034') Object.assign(e, { status: 409, message: 'ข้อมูลถูกแก้ไขพร้อมกัน กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง' });
    next(conflict(e));
  }
}
router.post('/', authenticate, saveCustomer);
router.put('/:id', authenticate, saveCustomer);

module.exports = router;
