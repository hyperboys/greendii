const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { validateSale } = require('../lib/accountCustomers');
const { recordAuditLog } = require('../lib/auditTrail');

router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const where = req.query.active === undefined ? {} : { active: req.query.active === 'true' };
    res.json(await prisma.accountSale.findMany({ where, orderBy: { code: 'asc' } }));
  } catch (error) { next(error); }
});
async function saveSale(req, res, next) {
  try {
    const result = await prisma.$transaction(async tx => {
      const previous = req.params.id ? await tx.accountSale.findUniqueOrThrow({ where: { id: req.params.id } }) : null;
      if (previous && req.body.updatedAt && new Date(req.body.updatedAt).getTime() !== previous.updatedAt.getTime()) {
        throw Object.assign(new Error('ข้อมูล Sale ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่'), { status: 409 });
      }
      const data = validateSale({ ...previous, ...req.body });
      const saved = previous
        ? await tx.accountSale.update({ where: { id: previous.id }, data })
        : await tx.accountSale.create({ data });
      await recordAuditLog({
        entityType: 'account_sale', entityId: saved.id, action: previous ? 'update' : 'create',
        oldValue: previous, newValue: saved, req,
      }, tx);
      return saved;
    }, { isolationLevel: 'Serializable' });
    res.status(req.params.id ? 200 : 201).json(result);
  } catch (error) {
    if (error.code === 'P2034') Object.assign(error, { status: 409, message: 'ข้อมูลถูกแก้ไขพร้อมกัน กรุณาโหลดข้อมูลใหม่' });
    next(error);
  }
}
router.post('/', saveSale);
router.put('/:id', saveSale);
module.exports = router;
