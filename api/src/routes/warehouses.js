const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, paginated } = require('../lib/pagination');

// GET /api/warehouses
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { active, q } = req.query;
    const where = {};
    if (active !== undefined) where.active = active === 'true';
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.warehouse.findMany({
          where,
          orderBy: { code: 'asc' },
          skip: pg.skip,
          take: pg.take,
          include: { stockBalances: { include: { product: true } } },
        }),
        prisma.warehouse.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.warehouse.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { stockBalances: { include: { product: true } } },
    });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

// GET /api/warehouses/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.warehouse.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { stockBalances: { include: { product: true } } },
    });
    res.json(item);
  } catch (e) {
    next(e);
  }
});

// POST /api/warehouses
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { code, name, location } = req.body;
    if (!code || !name) {
      return res.status(400).json({ message: 'โปรดระบุ รหัสคลังสินค้า (code) และ ชื่อคลังสินค้า (name)' });
    }

    const item = await prisma.warehouse.create({
      data: {
        code: String(code).trim(),
        name: String(name).trim(),
        location,
      },
    });

    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});

// PUT /api/warehouses/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { code, name, location, active } = req.body;
    const item = await prisma.warehouse.update({
      where: { id: req.params.id },
      data: { code, name, location, active },
    });
    res.json(item);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/warehouses/:id (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await prisma.warehouse.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ message: 'Warehouse deactivated' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
