const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { recordAuditLog } = require('../lib/auditTrail');
const { getPagination, paginated } = require('../lib/pagination');
const { assertActive } = require('../lib/accountingMaster');
const { lockWarehouse } = require('../lib/goodsReceipt');

router.use('/issues', require('./stock-issues'));

// ─── 2. STOCK RETURNS ────────────────────────────────────────────────────────

// POST /api/inventory/returns
router.post('/returns', authenticate, async (req, res, next) => {
  try {
    const { returnDate, workOrderId, stockIssueId, warehouseId, condition = 'good', remark, items = [] } = req.body;
    if (!warehouseId) return res.status(400).json({ message: 'กรุณาระบุคลังสินค้า (warehouseId)' });

    const result = await prisma.$transaction(async (tx) => {
      if (stockIssueId) {
        await tx.$queryRaw`SELECT id FROM stock_issues WHERE id = ${stockIssueId} FOR UPDATE`;
        const issue = await tx.stockIssue.findUnique({ where: { id: stockIssueId } });
        if (issue?.lifecycleVersion === 1) throw Object.assign(new Error('ใบเบิกรุ่นใหม่ต้องใช้ workflow ใบคืนใหม่ ซึ่งยังไม่เปิดใช้ ห้ามคืนผ่าน endpoint เดิม'), { status: 409 });
      }
      await lockWarehouse(tx, warehouseId);
      await assertActive(tx, 'warehouse', warehouseId, 'คลังสินค้า');
      for (const item of items) await assertActive(tx, 'accountProduct', item.productId, 'สินค้า');
      // Validate returned qty against original issue if referencing stockIssueId
      if (stockIssueId) {
        const issue = await tx.stockIssue.findUniqueOrThrow({
          where: { id: stockIssueId },
          include: { items: true },
        });

        for (const item of items) {
          const issueLine = issue.items.find(it => it.productId === item.productId);
          if (issueLine) {
            const returnedQty = parseFloat(item.returnedQty) || 0;
            if (returnedQty > Number(issueLine.issuedQty)) {
              throw new Error(`จำนวนสินค้าที่คืน (${returnedQty}) เกินกว่าจำนวนที่เคยเบิก (${issueLine.issuedQty})`);
            }
          }
        }
      }

      const count = await tx.stockReturn.count();
      const returnNo = `SR-${String(count + 1).padStart(5, '0')}`;

      const doc = await tx.stockReturn.create({
        data: {
          returnNo,
          returnDate: returnDate ? new Date(returnDate) : new Date(),
          workOrderId,
          stockIssueId,
          warehouseId,
          condition,
          remark,
          createdById: req.user.id,
          status: 'approved',
          items: {
            create: items.map((it, idx) => ({
              seq: idx,
              productId: it.productId,
              returnedQty: parseFloat(it.returnedQty) || 0,
            })),
          },
        },
        include: { items: true },
      });

      // Create Stock Movement & Update Stock Balance for good condition
      for (const item of items) {
        const retQty = parseFloat(item.returnedQty) || 0;

        await tx.stockMovement.create({
          data: {
            movementType: 'in',
            productId: item.productId,
            warehouseId,
            qtyIn: retQty,
            qtyOut: 0,
            sourceDocType: 'stock_return',
            sourceDocId: doc.id,
            sourceDocNo: doc.returnNo,
            transactionDate: doc.returnDate,
            createdById: req.user.id,
            remark: `คืนสินค้า ${doc.returnNo} (สภาพ: ${condition})`,
          },
        });

        const existingBalance = await tx.stockBalance.findUnique({
          where: { warehouseId_productId: { warehouseId, productId: item.productId } },
        });

        const currentOnHand = existingBalance ? Number(existingBalance.onHand) : 0;
        const newOnHand = currentOnHand + retQty;
        const currentReserved = existingBalance ? Number(existingBalance.reserved) : 0;

        await tx.stockBalance.upsert({
          where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          create: {
            warehouseId,
            productId: item.productId,
            onHand: newOnHand,
            reserved: 0,
            available: newOnHand,
          },
          update: {
            onHand: newOnHand,
            available: Math.max(0, newOnHand - currentReserved),
          },
        });
      }

      await recordAuditLog({
        entityType: 'stock_return',
        entityId: doc.id,
        docNo: doc.returnNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ─── 3. STOCK MOVEMENTS & STOCK CARDS ────────────────────────────────────────

// GET /api/inventory/movements — List stock card entries
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

    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.stockMovement.findMany({
          where,
          orderBy: { transactionDate: 'desc' },
          skip: pg.skip,
          take: pg.take,
          include: { product: true, warehouse: true },
        }),
        prisma.stockMovement.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }

    const list = await prisma.stockMovement.findMany({
      where,
      orderBy: { transactionDate: 'desc' },
      include: { product: true, warehouse: true },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/inventory/balances — List stock balances
router.get('/balances', authenticate, async (req, res, next) => {
  try {
    const { warehouseId, productId } = req.query;
    const where = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (productId) where.productId = productId;

    const list = await prisma.stockBalance.findMany({
      where,
      include: { product: true, warehouse: true },
    });
    res.json(list);
  } catch (e) { next(e); }
});

module.exports = router;
