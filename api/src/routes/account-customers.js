const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, paginated } = require('../lib/pagination');
const { CUSTOMER_INCLUDE, validateCustomer } = require('../lib/accountCustomers');
const { recordAuditLog } = require('../lib/auditTrail');

// GET /api/account-customers
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { active, q } = req.query;
    const where = {};
    if (active !== undefined) where.active = active === 'true';
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { taxId: { contains: q, mode: 'insensitive' } },
      ];
    }
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.accountCustomer.findMany({ where, include: CUSTOMER_INCLUDE, orderBy: { name: 'asc' }, skip: pg.skip, take: pg.take }),
        prisma.accountCustomer.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.accountCustomer.findMany({ where, include: CUSTOMER_INCLUDE, orderBy: { name: 'asc' } });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/account-customers/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.accountCustomer.findUniqueOrThrow({ where: { id: req.params.id }, include: CUSTOMER_INCLUDE });
    res.json(item);
  } catch (e) { next(e); }
});

async function saveCustomer(req, res, next) {
  try {
    const item = await prisma.$transaction(async tx => {
      const previous = req.params.id ? await tx.accountCustomer.findUniqueOrThrow({
        where: { id: req.params.id }, include: CUSTOMER_INCLUDE,
      }) : null;
      if (previous && req.body.updatedAt && new Date(req.body.updatedAt).getTime() !== previous.updatedAt.getTime()) {
        throw Object.assign(new Error('ข้อมูลลูกค้าถูกแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่'), { status: 409 });
      }
      const { branches, ...data } = validateCustomer(req.body, previous);
      if (data.responsibleSaleId) {
        const sale = await tx.accountSale.findUnique({ where: { id: data.responsibleSaleId } });
        if (!sale || (!sale.active && previous?.responsibleSaleId !== sale.id)) {
          throw Object.assign(new Error('Sale ผู้ดูแลไม่ถูกต้องหรือถูกปิดใช้งาน'), { status: 400 });
        }
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
          addresses: { create: branch.addresses.map((address, addressPosition) => ({
            ...(address.id ? { id: address.id } : {}), label: address.label, kind: address.kind,
            address: address.address, position: addressPosition,
          })) },
        })) };
      }
      const saved = previous ? await tx.accountCustomer.update({
        where: { id: previous.id }, data, include: CUSTOMER_INCLUDE,
      }) : await tx.accountCustomer.create({ data, include: CUSTOMER_INCLUDE });
      await recordAuditLog({
        entityType: 'account_customer', entityId: saved.id, action: previous ? 'update' : 'create',
        oldValue: previous, newValue: saved, req,
      }, tx);
      return saved;
    }, { isolationLevel: 'Serializable' });
    res.status(req.params.id ? 200 : 201).json(item);
  } catch (e) {
    if (e.code === 'P2034') Object.assign(e, { status: 409, message: 'ข้อมูลถูกแก้ไขพร้อมกัน กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง' });
    next(e);
  }
}
router.post('/', authenticate, saveCustomer);
router.put('/:id', authenticate, saveCustomer);

// DELETE /api/account-customers/:id (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await prisma.$transaction(async tx => {
      const previous = await tx.accountCustomer.findUniqueOrThrow({ where: { id: req.params.id } });
      const saved = await tx.accountCustomer.update({ where: { id: req.params.id }, data: { active: false } });
      await recordAuditLog({ entityType: 'account_customer', entityId: saved.id, action: 'deactivate', oldValue: previous, newValue: saved, req }, tx);
    });
    res.json({ message: 'Account customer deactivated' });
  } catch (e) { next(e); }
});

module.exports = router;
