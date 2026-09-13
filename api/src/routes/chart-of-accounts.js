const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, paginated } = require('../lib/pagination');

// GET /api/chart-of-accounts
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
        prisma.chartOfAccount.findMany({ where, orderBy: { code: 'asc' }, skip: pg.skip, take: pg.take }),
        prisma.chartOfAccount.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.chartOfAccount.findMany({ where, orderBy: { code: 'asc' } });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

// GET /api/chart-of-accounts/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.chartOfAccount.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(item);
  } catch (e) {
    next(e);
  }
});

// POST /api/chart-of-accounts
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { code, name, category, accountType = 'detail', accountMapping } = req.body;
    if (!code || !name || !category) {
      return res.status(400).json({ message: 'โปรดระบุ รหัสบัญชี (code), ชื่อบัญชี (name) และ หมวดหมู่บัญชี (category)' });
    }

    const item = await prisma.chartOfAccount.create({
      data: {
        code: String(code).trim(),
        name: String(name).trim(),
        category,
        accountType,
        accountMapping,
      },
    });

    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});

// PUT /api/chart-of-accounts/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { code, name, category, accountType, accountMapping, active } = req.body;
    const item = await prisma.chartOfAccount.update({
      where: { id: req.params.id },
      data: { code, name, category, accountType, accountMapping, active },
    });
    res.json(item);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/chart-of-accounts/:id (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await prisma.chartOfAccount.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ message: 'Chart of Account deactivated' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
