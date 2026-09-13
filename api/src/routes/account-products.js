const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, paginated } = require('../lib/pagination');

// GET /api/account-products
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { active, q, category } = req.query;
    const where = {};
    if (active !== undefined) where.active = active === 'true';
    if (category) where.category = category;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.accountProduct.findMany({ where, orderBy: { name: 'asc' }, skip: pg.skip, take: pg.take }),
        prisma.accountProduct.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.accountProduct.findMany({ where, orderBy: { name: 'asc' } });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/account-products/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.accountProduct.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/account-products
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { code, name, category, unit, productType = 'stored', vatConfig = 'VAT7%', price, cost, description } = req.body;
    if (!code || !name) return res.status(400).json({ message: 'โปรดระบุ รหัสสินค้า (code) และ ชื่อสินค้า (name)' });

    const item = await prisma.accountProduct.create({
      data: {
        code: String(code).trim(),
        name: String(name).trim(),
        category,
        unit,
        productType,
        vatConfig,
        price: parseFloat(price) || 0,
        cost: parseFloat(cost) || 0,
        description,
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/account-products/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { code, name, category, unit, productType, vatConfig, price, cost, description, active } = req.body;
    const item = await prisma.accountProduct.update({
      where: { id: req.params.id },
      data: {
        code,
        name,
        category,
        unit,
        productType,
        vatConfig,
        price: price != null ? parseFloat(price) : undefined,
        cost: cost != null ? parseFloat(cost) : undefined,
        description,
        active,
      },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/account-products/:id (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await prisma.accountProduct.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Account product deactivated' });
  } catch (e) { next(e); }
});

module.exports = router;
