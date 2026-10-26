const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, paginated } = require('../lib/pagination');
const { stockCard } = require('../lib/stockCard');

router.use('/issues', require('./stock-issues'));
router.use('/returns', require('./stock-returns'));
router.use('/opening-balances', require('./stock-opening-balances'));

router.get('/stock-card/lookups', authenticate, async (_req, res, next) => {
  try {
    const [products, warehouses] = await Promise.all([
      prisma.accountProduct.findMany({ select: { id: true, code: true, name: true, unit: true, active: true }, orderBy: { name: 'asc' } }),
      prisma.warehouse.findMany({ select: { id: true, code: true, name: true, active: true }, orderBy: { name: 'asc' } }),
    ]);
    res.json({ products, warehouses });
  } catch (error) { next(error); }
});

router.get('/stock-card', authenticate, async (req, res, next) => {
  try {
    res.json(await stockCard(prisma, req.query));
  } catch (error) { next(error); }
});

router.get('/movements', authenticate, async (req, res, next) => {
  try {
    const { productId, warehouseId, from, to } = req.query;
    const where = {};
    if (productId) where.productId = productId;
    if (warehouseId) where.warehouseId = warehouseId;
    if (from || to) {
      where.transactionDate = {};
      if (from) where.transactionDate.gte = new Date(from);
      if (to) where.transactionDate.lte = new Date(to);
    }
    const args = { where, orderBy: { transactionDate: 'desc' }, include: { product: true, warehouse: true } };
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.stockMovement.findMany({ ...args, skip: pg.skip, take: pg.take }), prisma.stockMovement.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    res.json(await prisma.stockMovement.findMany(args));
  } catch (error) { next(error); }
});
router.get('/balances', authenticate, async (req, res, next) => {
  try {
    const { warehouseId, productId } = req.query;
    const where = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (productId) where.productId = productId;
    res.json(await prisma.stockBalance.findMany({ where, include: { product: true, warehouse: true } }));
  } catch (error) { next(error); }
});
module.exports = router;
