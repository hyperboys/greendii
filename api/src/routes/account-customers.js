const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, paginated } = require('../lib/pagination');

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
        prisma.accountCustomer.findMany({ where, orderBy: { name: 'asc' }, skip: pg.skip, take: pg.take }),
        prisma.accountCustomer.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.accountCustomer.findMany({ where, orderBy: { name: 'asc' } });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/account-customers/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.accountCustomer.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/account-customers
router.post('/', authenticate, async (req, res, next) => {
  try {
    const {
      code,
      name,
      contactPerson,
      tel,
      email,
      address,
      billingAddress,
      shippingAddress,
      branch = 'สำนักงานใหญ่',
      taxId,
      type = 'นิติบุคคล',
      vatConfig = 'VAT7%',
      creditTerm = 30,
    } = req.body;

    if (!name) return res.status(400).json({ message: 'กรุณาระบุชื่อลูกค้า (name)' });

    const item = await prisma.accountCustomer.create({
      data: {
        code: code || null,
        name: String(name).trim(),
        contactPerson,
        tel,
        email,
        address,
        billingAddress,
        shippingAddress,
        branch,
        taxId,
        type,
        vatConfig,
        creditTerm: parseInt(creditTerm, 10) || 30,
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/account-customers/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const {
      code,
      name,
      contactPerson,
      tel,
      email,
      address,
      billingAddress,
      shippingAddress,
      branch,
      taxId,
      type,
      vatConfig,
      creditTerm,
      active,
    } = req.body;

    const item = await prisma.accountCustomer.update({
      where: { id: req.params.id },
      data: {
        code,
        name,
        contactPerson,
        tel,
        email,
        address,
        billingAddress,
        shippingAddress,
        branch,
        taxId,
        type,
        vatConfig,
        creditTerm: creditTerm != null ? parseInt(creditTerm, 10) : undefined,
        active,
      },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/account-customers/:id (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await prisma.accountCustomer.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Account customer deactivated' });
  } catch (e) { next(e); }
});

module.exports = router;
