const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid, documentDate } = require('../lib/deliveryOrder');
const { boundedText, normalizedSnapshot } = require('../lib/contractorPayment');
const { quantity } = require('../lib/goodsReceipt');
const { lockWarehouse } = require('../lib/stockOpeningBalance');
const { inventoryBalances } = require('../lib/inventorySummary');
const { cost, fixed, D, valuation } = require('../lib/stockCost');
const { requestKey, hash, revision, balanceFor, audit } = require('../lib/stockTransfer');
router.use(authenticate);
const permit = action => async (req, _res, next) => {
  try {
    if (!hasAccountingPermission(await getAccountingAccess(req.user), 'inventory', action)) invalid(`ไม่มีสิทธิ์ inventory.${action}`, 403);
    next();
  } catch (error) { next(error); }
};
const keyInput = body => ({ warehouseId: boundedText(body.warehouseId, 'คลัง', true, 100), productId: boundedText(body.productId, 'สินค้า', true, 100) });
async function validateKey(tx, key) {
  await lockWarehouse(tx, key.warehouseId);
  const product = await tx.accountProduct.findUnique({ where: { id: key.productId } });
  if (!product?.active || !['stored', 'manufactured'].includes(product.productType)) invalid('ต้องใช้สินค้าเก็บคลัง/ผลิต active', 409);
  return product;
}
router.get('/valuations', permit('view'), async (req, res, next) => {
  try { res.json(await inventoryBalances(prisma, Object.fromEntries(Object.entries(keyInput({ warehouseId: req.query.warehouseId || 'all', productId: req.query.productId || 'all' })).filter(([, value]) => value !== 'all')))); }
  catch (error) { next(error); }
});
router.get('/low-stock', permit('view'), async (_req, res, next) => {
  try { res.json((await inventoryBalances(prisma)).filter(row => row.lowStock)); } catch (error) { next(error); }
});
router.put('/thresholds', permit('update'), async (req, res, next) => {
  try {
    const key = keyInput(req.body), threshold = req.body.lowStockThreshold == null || req.body.lowStockThreshold === '' ? null : quantity(req.body.lowStockThreshold, 'จุดเตือน', true) / 1000;
    res.json(await prisma.$transaction(async tx => {
      await validateKey(tx, key);
      const previous = await tx.stockBalance.findUnique({ where: { warehouseId_productId: key } });
      if (previous ? req.body.updatedAt !== previous.updatedAt.toISOString() : req.body.updatedAt != null) invalid('ยอดเปลี่ยนแล้ว โหลดใหม่ก่อนตั้งจุดเตือน', 409);
      const doc = await tx.stockBalance.upsert({ where: { warehouseId_productId: key },
        create: { ...key, onHand: 0, reserved: 0, available: 0, lowStockThreshold: threshold }, update: { lowStockThreshold: threshold } });
      await audit(tx, req, 'stock_threshold', 'update', previous, doc); return doc;
    }));
  } catch (error) { next(error); }
});
router.get('/cost-initializations', permit('view'), async (_req, res, next) => {
  try { res.json(await prisma.stockCostInitialization.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })); }
  catch (error) { next(error); }
});
router.post('/cost-initializations', permit('create'), async (req, res, next) => {
  try {
    const key = keyInput(req.body), totalValue = fixed(cost(req.body.totalValue, 'มูลค่ายกมารวมที่ตรวจสอบแล้ว'));
    const countedQty = (quantity(req.body.quantity, 'จำนวนที่ตรวจสอบ', true) / 1000).toFixed(3);
    if (D(countedQty).eq(0) && !D(totalValue).eq(0)) invalid('จำนวนศูนย์ต้องมีมูลค่าศูนย์');
    const asOf = documentDate(req.body.asOf, 'วันที่ฐานต้นทุน', true), evidence = boundedText(req.body.evidence, 'เอกสาร/วิธีตรวจสอบมูลค่า', true, 1000);
    if (asOf > new Date()) invalid('ตั้งต้นทุนในอนาคตไม่ได้');
    const input = { ...key, totalValue, quantity: countedQty, asOf, evidence }, idempotency = requestKey(req.body.requestKey), requestHash = hash(input);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`stock_cost_initialization:${idempotency}`}))`;
      const replay = await tx.stockCostInitialization.findUnique({ where: { requestKey: idempotency } });
      if (replay) {
        if (replay.requestHash !== requestHash || replay.createdById !== req.user.id) invalid('requestKey ใช้กับข้อมูลอื่น', 409);
        return replay;
      }
      const product = await validateKey(tx, key), balance = await balanceFor(tx, key);
      if (!balance || req.body.updatedAt !== balance.updatedAt.toISOString() || !D(balance.onHand).eq(countedQty)) invalid('จำนวน/Revision เปลี่ยนแล้ว ต้องตรวจใหม่', 409);
      const state = await valuation(tx, key, balance);
      if (state?.status === 'valued') invalid('ฐานมีต้นทุนแล้ว ไม่รองรับ revaluation โดยเขียนทับ', 409);
      const events = await tx.stockMovement.findMany({ where: key });
      if (events.some(row => row.transactionDate > asOf) || (state?.lastDate && state.lastDate > asOf)) invalid('วันที่ฐานต้นทุนต้องไม่ก่อน Movement ล่าสุด', 409);
      if (await tx.stockCostInitialization.findFirst({ where: { ...key, status: 'pending' } })) invalid('มีคำขอต้นทุนรออนุมัติแล้ว', 409);
      const doc = await tx.stockCostInitialization.create({ data: { ...input, requestKey: idempotency, requestHash, status: 'pending', revision: 1,
        balanceRevision: balance.updatedAt, createdById: req.user.id,
        snapshot: normalizedSnapshot({ product: { code: product.code, name: product.name, unit: product.unit }, valuationRevision: state?.revision || null,
          lastMovementId: state?.lastMovementId || null, balance: { onHand: String(balance.onHand), reserved: String(balance.reserved), available: String(balance.available) } }) } });
      await audit(tx, req, 'stock_cost_initialization', 'submit', null, doc); return doc;
    });
    res.status(201).json(result);
  } catch (error) { next(error); }
});
for (const action of ['approve', 'reject', 'cancel']) router.post(`/cost-initializations/:id/${action}`, permit(action === 'cancel' ? 'cancel' : 'approve'), async (req, res, next) => {
  try {
    const reason = boundedText(req.body.reason, 'เหตุผล', action !== 'approve', 1000);
    res.json(await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM stock_cost_initializations WHERE id = ${req.params.id} FOR UPDATE`;
      const previous = await tx.stockCostInitialization.findUnique({ where: { id: req.params.id } });
      if (!previous) invalid('ไม่พบคำขอต้นทุน', 404);
      revision(previous, req.body.revision);
      if (previous.status !== 'pending') invalid('คำขอต้นทุนไม่รออนุมัติ', 409);
      const key = { warehouseId: previous.warehouseId, productId: previous.productId };
      await validateKey(tx, key);
      if (action === 'approve') {
        if (previous.createdById === req.user.id) invalid('ผู้สร้างห้ามอนุมัติต้นทุนตัวเอง รวม admin', 403);
        const balance = await balanceFor(tx, key), state = await valuation(tx, key, balance);
        if (!balance || balance.updatedAt.getTime() !== previous.balanceRevision.getTime() || !D(balance.onHand).eq(previous.quantity) ||
          (state?.revision || null) !== previous.snapshot.valuationRevision || (state?.lastMovementId || null) !== previous.snapshot.lastMovementId) invalid('Stock เปลี่ยนหลังขอต้นทุน ต้องยกเลิกคำขอแล้วตรวจใหม่', 409);
        if (state?.status === 'valued') invalid('ฐานต้นทุนถูกตั้งแล้ว', 409);
        const data = { status: 'valued', quantity: previous.quantity, totalValue: previous.totalValue, lastMovementId: null, lastDate: previous.asOf,
          provenance: { type: 'verified_opening_initialization', initializationId: previous.id, evidence: previous.evidence, createdById: previous.createdById, approvedById: req.user.id } };
        await tx.stockValuation.upsert({ where: { warehouseId_productId: key }, create: { ...key, ...data, revision: 1 },
          update: { ...data, revision: { increment: 1 } } });
      }
      const doc = await tx.stockCostInitialization.update({ where: { id: previous.id }, data: { status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'cancelled',
        revision: { increment: 1 }, ...(action === 'approve' ? { approvedById: req.user.id } : {}) } });
      await audit(tx, req, 'stock_cost_initialization', action, previous, doc, reason); return doc;
    }));
  } catch (error) { next(error); }
});
module.exports = router;
