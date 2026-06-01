const router = require('express').Router();
const { body } = require('express-validator');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../lib/validate');
const { getPagination, paginated } = require('../lib/pagination');

const MANAGER_ROLES = ['admin', 'sale_mgr', 'admin_mgr', 'director'];

const customerValidators = [
  body('name').trim().notEmpty().withMessage('กรุณาระบุชื่อลูกค้า'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('รูปแบบอีเมลไม่ถูกต้อง'),
  body('type').optional({ nullable: true, checkFalsy: true }).isIn(['company', 'individual', 'government']).withMessage('ประเภทลูกค้าไม่ถูกต้อง'),
];

function canSeeAllCustomers(role) {
  return MANAGER_ROLES.includes(role);
}

async function getAccessibleCustomerOrThrow(req, id) {
  const item = await prisma.customer.findUniqueOrThrow({ where: { id } });
  if (!canSeeAllCustomers(req.user.role) && item.salesId !== req.user.id) {
    const err = new Error('Forbidden')
    err.status = 403
    throw err
  }
  return item
}

// GET /api/customers
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { active, q, salesId } = req.query;
    const where = {};
    if (active !== undefined) where.active = active === 'true';
    if (q) where.name = { contains: q, mode: 'insensitive' };
    if (!canSeeAllCustomers(req.user.role)) {
      where.salesId = req.user.id;
    } else if (salesId) {
      where.salesId = salesId;
    }
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip: pg.skip, take: pg.take }),
        prisma.customer.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/customers/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await getAccessibleCustomerOrThrow(req, req.params.id);
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/customers
router.post('/', authenticate, customerValidators, validate, async (req, res, next) => {
  try {
    const { name, contactPerson, tel, email, address, taxId, type } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const item = await prisma.customer.create({
      data: { name, contactPerson, tel, email, address, taxId, type: type || 'company', salesId: req.user.id },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/customers/:id
router.put('/:id', authenticate, customerValidators, validate, async (req, res, next) => {
  try {
    const { name, contactPerson, tel, email, address, taxId, type, active } = req.body;
    const existing = await getAccessibleCustomerOrThrow(req, req.params.id);
    const item = await prisma.customer.update({
      where: { id: req.params.id },
      data: { name, contactPerson, tel, email, address, taxId, type, active, salesId: existing.salesId || req.user.id },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/customers/:id  (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await getAccessibleCustomerOrThrow(req, req.params.id);
    await prisma.customer.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Customer deactivated' });
  } catch (e) { next(e); }
});

module.exports = router;
