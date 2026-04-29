const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

// GET /api/products
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { active, q, category } = req.query;
    const where = {};
    if (active !== undefined) where.active = active === 'true';
    if (category) where.category = category;
    if (q) where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { code: { contains: q, mode: 'insensitive' } },
    ];
    const list = await prisma.product.findMany({ where, orderBy: { name: 'asc' } });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/products/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.product.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/products
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { code, name, category, unit, price, cost, description } = req.body;
    if (!code || !name) return res.status(400).json({ message: 'code and name required' });
    const item = await prisma.product.create({
      data: { code, name, category, unit, price: price || 0, cost: cost || 0, description },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/products/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { code, name, category, unit, price, cost, description, active } = req.body;
    const item = await prisma.product.update({
      where: { id: req.params.id },
      data: { code, name, category, unit, price, cost, description, active },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/products/:id  (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await prisma.product.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Product deactivated' });
  } catch (e) { next(e); }
});

module.exports = router;
