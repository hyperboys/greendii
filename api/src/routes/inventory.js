const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { recordAuditLog } = require('../lib/auditTrail');
const { getPagination, paginated } = require('../lib/pagination');

// ─── 1. STOCK ISSUES ─────────────────────────────────────────────────────────

// GET /api/inventory/issues
router.get('/issues', authenticate, async (req, res, next) => {
  try {
    const { status, warehouseId, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (warehouseId) where.warehouseId = warehouseId;
    if (q) where.issueNo = { contains: q, mode: 'insensitive' };

    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.stockIssue.findMany({
          where,
          orderBy: { issueDate: 'desc' },
          skip: pg.skip,
          take: pg.take,
          include: { warehouse: true, items: { include: { product: true } } },
        }),
        prisma.stockIssue.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.stockIssue.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      include: { warehouse: true, items: { include: { product: true } } },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// POST /api/inventory/issues
router.post('/issues', authenticate, async (req, res, next) => {
  try {
    const { issueDate, workOrderId, warehouseId, remark, items = [] } = req.body;
    if (!warehouseId) return res.status(400).json({ message: 'กรุณาระบุคลังสินค้า (warehouseId)' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'ต้องระบุรายการเบิกสินค้าอย่างน้อย 1 รายการ' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Generate Issue Number
      const count = await tx.stockIssue.count();
      const issueNo = `IS-${String(count + 1).padStart(5, '0')}`;

      // 2. Validate Stock Balances
      for (const item of items) {
        const product = await tx.accountProduct.findUniqueOrThrow({ where: { id: item.productId } });
        if (product.productType === 'service') {
          throw new Error(`ไม่สามารถเบิกสินค้าประเภทบริการ (${product.name}) ออกจากคลังได้`);
        }

        const balance = await tx.stockBalance.findUnique({
          where: { warehouseId_productId: { warehouseId, productId: item.productId } },
        });

        const requestedQty = parseFloat(item.requestedQty) || 0;
        const issuedQty = parseFloat(item.issuedQty) || requestedQty;

        const available = balance ? Number(balance.available) : 0;
        if (issuedQty > available) {
          throw new Error(`สินค้า ${product.name} มีจำนวนคงเหลือไม่พอเบิก (มี ${available}, ต้องการเบิก ${issuedQty})`);
        }
      }

      // 3. Create StockIssue document
      const doc = await tx.stockIssue.create({
        data: {
          issueNo,
          issueDate: issueDate ? new Date(issueDate) : new Date(),
          workOrderId,
          warehouseId,
          remark,
          createdById: req.user.id,
          status: 'approved', // Stock movement takes immediate effect on creation
          items: {
            create: items.map((it, idx) => {
              const reqQty = parseFloat(it.requestedQty) || 0;
              const issQty = parseFloat(it.issuedQty) || reqQty;
              return {
                seq: idx,
                productId: it.productId,
                requestedQty: reqQty,
                issuedQty: issQty,
                cancelledQty: Math.max(0, reqQty - issQty),
              };
            }),
          },
        },
        include: { items: true },
      });

      // 4. Update Stock Movement & Stock Balance
      for (const item of items) {
        const reqQty = parseFloat(item.requestedQty) || 0;
        const issQty = parseFloat(item.issuedQty) || reqQty;

        await tx.stockMovement.create({
          data: {
            movementType: 'out',
            productId: item.productId,
            warehouseId,
            qtyIn: 0,
            qtyOut: issQty,
            sourceDocType: 'stock_issue',
            sourceDocId: doc.id,
            sourceDocNo: doc.issueNo,
            transactionDate: doc.issueDate,
            createdById: req.user.id,
            remark: `เบิกสินค้า ${doc.issueNo}`,
          },
        });

        const existingBalance = await tx.stockBalance.findUniqueOrThrow({
          where: { warehouseId_productId: { warehouseId, productId: item.productId } },
        });

        const newOnHand = Math.max(0, Number(existingBalance.onHand) - issQty);
        const newAvailable = Math.max(0, newOnHand - Number(existingBalance.reserved));

        await tx.stockBalance.update({
          where: { warehouseId_productId: { warehouseId, productId: item.productId } },
          data: {
            onHand: newOnHand,
            available: newAvailable,
          },
        });
      }

      await recordAuditLog({
        entityType: 'stock_issue',
        entityId: doc.id,
        docNo: doc.issueNo,
        action: 'create',
        newValue: doc,
        req,
      }, tx);

      return doc;
    });

    res.status(201).json(result);
  } catch (e) { next(e); }
});

// ─── 2. STOCK RETURNS ────────────────────────────────────────────────────────

// POST /api/inventory/returns
router.post('/returns', authenticate, async (req, res, next) => {
  try {
    const { returnDate, workOrderId, stockIssueId, warehouseId, condition = 'good', remark, items = [] } = req.body;
    if (!warehouseId) return res.status(400).json({ message: 'กรุณาระบุคลังสินค้า (warehouseId)' });

    const result = await prisma.$transaction(async (tx) => {
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
