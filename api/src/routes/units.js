const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');

// GET /api/units
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { active } = req.query;
    const where = {};
    if (active !== undefined) where.active = active === 'true';
    const list = await prisma.unit.findMany({ where, orderBy: { name: 'asc' } });
    res.json(list);
  } catch (e) { next(e); }
});

// POST /api/units
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: 'name required' });
    const item = await prisma.unit.create({ data: { name } });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/units/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { name, active } = req.body;
    const item = await prisma.unit.update({
      where: { id: req.params.id },
      data: { name, active },
    });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/units/:id  (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await prisma.unit.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'Unit deactivated' });
  } catch (e) { next(e); }
});

module.exports = router;
