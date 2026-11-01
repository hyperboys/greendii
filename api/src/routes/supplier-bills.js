const router = require('express').Router();
const { createHash } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { invalid, documentDate } = require('../lib/deliveryOrder');
const { boundedText } = require('../lib/contractorPayment');
const { getPagination, paginated } = require('../lib/pagination');
const { generateNextRunningNumber } = require('../lib/runningNumber');
const { BILL_STATUSES, BILL_INCLUDE, cents, decimal, amount, addDays, revisionOf, billInput, billTotals, billData,
  assertNoDuplicate, voucherPaid, voucherCapacity, billBalances, presentBill, lockBill, lockVouchers, billAudit,
  conflictError } = require('../lib/supplierBill');

router.use(authenticate);
const permit = (...actions) => async (req, res, next) => {
  try {
    const access = await getAccountingAccess(req.user);
    for (const action of actions) if (!hasAccountingPermission(access, 'ap', action)) invalid(`ไม่มีสิทธิ์ ap.${action}`, 403);
    next();
  } catch (error) { next(error); }
};
const handle = handler => async (req, res, next) => {
  try { await handler(req, res); } catch (error) { next(conflictError(error)); }
};
const requestHash = input => createHash('sha256').update(JSON.stringify(input)).digest('hex');

router.get('/', permit('view'), handle(async (req, res) => {
  const q = boundedText(req.query.q, 'ค้นหา', false, 100), status = boundedText(req.query.status, 'สถานะ', false, 20);
  if (status && !BILL_STATUSES.includes(status)) invalid('สถานะใบแจ้งหนี้ผู้ขายไม่ถูกต้อง');
  const supplierId = boundedText(req.query.supplierId, 'ผู้ขาย', false, 100);
  const where = { ...(status ? { status } : {}), ...(supplierId ? { supplierId } : {}),
    ...(q ? { OR: [{ billNo: { contains: q, mode: 'insensitive' } }, { supplierInvoiceNo: { contains: q, mode: 'insensitive' } },
      { taxInvoiceNo: { contains: q, mode: 'insensitive' } }, { reference: { contains: q, mode: 'insensitive' } },
      { supplierSnapshot: { path: ['name'], string_contains: q } }] } : {}) };
  const orderBy = [{ supplierInvoiceDate: 'desc' }, { id: 'desc' }];
  const pg = getPagination(req.query);
  if (!pg) return res.json((await prisma.supplierBill.findMany({ where, include: BILL_INCLUDE, orderBy, take: 500 })).map(presentBill));
  const [data, total] = await prisma.$transaction([
    prisma.supplierBill.findMany({ where, include: BILL_INCLUDE, orderBy, skip: pg.skip, take: pg.take }),
    prisma.supplierBill.count({ where }),
  ]);
  res.json(paginated(data.map(presentBill), total, pg));
}));

router.get('/:id', permit('view'), handle(async (req, res) => {
  const bill = await prisma.supplierBill.findUnique({ where: { id: req.params.id }, include: BILL_INCLUDE });
  if (!bill) invalid('ไม่พบใบแจ้งหนี้ผู้ขาย', 404);
  const history = await prisma.auditLog.findMany({ where: { entityType: 'supplier_bill', entityId: bill.id },
    select: { id: true, action: true, reason: true, performedBy: { select: { fullName: true } }, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  res.json({ ...presentBill(bill), history });
}));

// Paid, non-reversed PVs of the bill's supplier that still have unallocated settlement value.
router.get('/:id/payment-vouchers', permit('view'), handle(async (req, res) => {
  const bill = await prisma.supplierBill.findUnique({ where: { id: req.params.id }, select: { supplierId: true } });
  if (!bill) invalid('ไม่พบใบแจ้งหนี้ผู้ขาย', 404);
  const vouchers = await prisma.paymentVoucher.findMany({
    where: { supplierId: bill.supplierId, lifecycleVersion: 1, status: 'approved', paidAt: { not: null }, reversedAt: null },
    select: { id: true, pvNo: true, pvDate: true, paidAt: true, sourceNo: true, netPayment: true, wht: true, status: true,
      lifecycleVersion: true, reversedAt: true, supplierBillSettlements: { where: { status: 'active' }, select: { amount: true } } },
    orderBy: [{ paidAt: 'asc' }, { id: 'asc' }], take: 200 });
  res.json(vouchers.filter(pv => voucherPaid(pv)).map(pv => {
    const capacity = voucherCapacity(pv), used = pv.supplierBillSettlements.reduce((sum, row) => sum + cents(row.amount), 0);
    return { id: pv.id, pvNo: pv.pvNo, pvDate: pv.pvDate, paidAt: pv.paidAt, sourceNo: pv.sourceNo,
      netPayment: amount(cents(pv.netPayment)), wht: amount(cents(pv.wht)), settlementCapacity: amount(capacity),
      allocatedAmount: amount(used), availableAmount: amount(capacity - used) };
  }).filter(pv => pv.availableAmount > 0));
}));

router.post('/', permit('create'), handle(async (req, res) => {
  const input = billInput(req.body), requestKey = boundedText(req.body.requestKey, 'requestKey', true, 100);
  if (!/^[a-zA-Z0-9-]{16,100}$/.test(requestKey)) invalid('requestKey ไม่ถูกต้อง');
  const hash = requestHash(input);
  const result = await prisma.$transaction(async tx => {
    const existing = await tx.supplierBill.findUnique({ where: { requestKey }, include: BILL_INCLUDE });
    if (existing) {
      if (existing.createdById !== req.user.id || existing.requestHash !== hash) invalid('requestKey ถูกใช้กับข้อมูลอื่นแล้ว', 409);
      return existing;
    }
    const { items, ...data } = await billData(tx, input);
    await assertNoDuplicate(tx, data);
    const billNo = await generateNextRunningNumber('sb', { date: new Date() }, tx);
    const bill = await tx.supplierBill.create({ data: { ...data, billNo, requestKey, requestHash: hash, revision: 1, status: 'draft',
      createdById: req.user.id, items: { create: items } }, include: BILL_INCLUDE });
    await billAudit(tx, req, 'create', null, bill);
    return bill;
  });
  res.status(201).json(presentBill(result));
}));

router.put('/:id', permit('update'), handle(async (req, res) => {
  const input = billInput(req.body), revision = revisionOf(req.body);
  res.json(presentBill(await prisma.$transaction(async tx => {
    const previous = await lockBill(tx, req.params.id, revision);
    if (previous.status !== 'draft') invalid('แก้ไขได้เฉพาะใบแจ้งหนี้ผู้ขายสถานะร่าง ข้อมูลที่ยืนยันแล้วเป็นข้อมูลถาวร', 409);
    const { items, ...data } = await billData(tx, input);
    await assertNoDuplicate(tx, data, previous.id);
    const bill = await tx.supplierBill.update({ where: { id: previous.id }, data: { ...data, revision: { increment: 1 },
      items: { deleteMany: {}, create: items } }, include: BILL_INCLUDE });
    await billAudit(tx, req, 'update', previous, bill);
    return bill;
  })));
}));

router.post('/:id/confirm', permit('approve'), handle(async (req, res) => {
  const revision = revisionOf(req.body);
  res.json(presentBill(await prisma.$transaction(async tx => {
    const previous = await lockBill(tx, req.params.id, revision);
    if (previous.status !== 'draft') invalid('ยืนยันได้เฉพาะใบแจ้งหนี้ผู้ขายสถานะร่าง', 409);
    if (previous.createdById === req.user.id) invalid('ผู้บันทึกไม่สามารถยืนยันตั้งหนี้ของตัวเองได้ แม้เป็น admin', 403);
    const supplier = await tx.supplier.findUnique({ where: { id: previous.supplierId } });
    if (!supplier || !supplier.active) invalid('ผู้ขายไม่มีอยู่หรือถูกปิดใช้งาน', 409);
    const totals = billTotals(previous.items.map(item => ({ amountCents: cents(item.amount) })), previous.vatMode);
    if (totals.subTotal !== cents(previous.subTotal) || totals.vat !== cents(previous.vat) || totals.net !== cents(previous.netAmount)) {
      invalid('ยอดรวมไม่สอดคล้องกับรายการ ต้องบันทึกร่างใหม่', 409);
    }
    if (previous.vatMode === 'VAT7' && !previous.taxInvoiceNo) invalid('บิลที่มี VAT ต้องมีใบกำกับภาษีก่อนยืนยัน', 409);
    await assertNoDuplicate(tx, previous, previous.id);
    const bill = await tx.supplierBill.update({ where: { id: previous.id }, data: { status: 'confirmed', revision: { increment: 1 },
      confirmedById: req.user.id, confirmedAt: new Date() }, include: BILL_INCLUDE });
    await billAudit(tx, req, 'confirm', previous, bill);
    return bill;
  })));
}));

router.post('/:id/cancel', permit('cancel'), handle(async (req, res) => {
  const revision = revisionOf(req.body), reason = boundedText(req.body.reason, 'เหตุผล', true, 1000);
  res.json(presentBill(await prisma.$transaction(async tx => {
    const previous = await lockBill(tx, req.params.id, revision);
    if (!['draft', 'confirmed'].includes(previous.status)) invalid('ใบแจ้งหนี้ผู้ขายถูกยกเลิกแล้ว', 409);
    if (previous.settlements.some(row => row.status === 'active')) invalid('ต้องยกเลิกรายการตัดชำระทั้งหมดก่อนยกเลิกใบแจ้งหนี้ผู้ขาย', 409);
    const bill = await tx.supplierBill.update({ where: { id: previous.id }, data: { status: 'cancelled', revision: { increment: 1 },
      cancelledById: req.user.id, cancelledAt: new Date(), cancelReason: reason }, include: BILL_INCLUDE });
    await billAudit(tx, req, 'cancel', previous, bill, reason);
    return bill;
  })));
}));

router.patch('/:id/due-date', permit('update'), handle(async (req, res) => {
  const revision = revisionOf(req.body), dueDate = documentDate(req.body?.dueDate, 'วันครบกำหนด', true);
  const reason = boundedText(req.body.reason, 'เหตุผล', true, 1000);
  res.json(presentBill(await prisma.$transaction(async tx => {
    const previous = await lockBill(tx, req.params.id, revision);
    if (!['draft', 'confirmed'].includes(previous.status)) invalid('ใบแจ้งหนี้ผู้ขายถูกยกเลิกแล้ว', 409);
    if (dueDate < previous.supplierInvoiceDate) invalid('วันครบกำหนดต้องไม่ก่อนวันที่ใบแจ้งหนี้ผู้ขาย');
    const computed = addDays(previous.supplierInvoiceDate, previous.creditTermDays);
    const bill = await tx.supplierBill.update({ where: { id: previous.id }, data: { dueDate, dueDateManual: dueDate.getTime() !== computed.getTime(),
      revision: { increment: 1 } }, include: BILL_INCLUDE });
    await billAudit(tx, req, 'due_date', previous, bill, reason);
    return bill;
  })));
}));

router.post('/:id/settlements', permit('pay'), handle(async (req, res) => {
  const revision = revisionOf(req.body);
  const paymentVoucherId = boundedText(req.body.paymentVoucherId, 'PV', true, 100);
  const value = cents(req.body.amount, 'ยอดตัดชำระ');
  if (!value) invalid('ยอดตัดชำระต้องมากกว่า 0');
  const reason = boundedText(req.body.reason, 'หมายเหตุ', false, 1000);
  const result = await prisma.$transaction(async tx => {
    const pv = (await lockVouchers(tx, [paymentVoucherId])).get(paymentVoucherId);
    const previous = await lockBill(tx, req.params.id, revision);
    if (previous.status !== 'confirmed') invalid('ตัดชำระได้เฉพาะใบแจ้งหนี้ผู้ขายที่ยืนยันแล้ว', 409);
    if (!voucherPaid(pv)) invalid('ใช้ได้เฉพาะ PV ที่บันทึกจ่ายจริงแล้ว และยังไม่ถูกยกเลิก/กลับรายการ', 409);
    if (pv.supplierId !== previous.supplierId) invalid('ผู้ขายของ PV ไม่ตรงกับใบแจ้งหนี้ผู้ขาย', 409);
    if (pv.supplierBillSettlements.some(row => row.billId === previous.id)) invalid('PV นี้ตัดชำระใบนี้อยู่แล้ว ให้ยกเลิกรายการเดิมก่อน', 409);
    const used = pv.supplierBillSettlements.reduce((sum, row) => sum + cents(row.amount), 0);
    if (used + value > voucherCapacity(pv)) invalid(`ยอดตัดชำระเกินยอด PV คงเหลือ (${decimal(voucherCapacity(pv) - used)})`, 409);
    if (value > billBalances(previous).outstanding) invalid(`ยอดตัดชำระเกินยอดคงค้างของบิล (${decimal(billBalances(previous).outstanding)})`, 409);
    await tx.supplierBillSettlement.create({ data: { billId: previous.id, paymentVoucherId: pv.id, amount: decimal(value),
      status: 'active', createdById: req.user.id } });
    const bill = await tx.supplierBill.update({ where: { id: previous.id }, data: { revision: { increment: 1 } }, include: BILL_INCLUDE });
    await billAudit(tx, req, 'settle', previous, bill, reason || `${pv.pvNo} ${decimal(value)}`);
    return bill;
  });
  res.status(201).json(presentBill(result));
}));

router.post('/:id/settlements/:settlementId/void', permit('pay', 'cancel'), handle(async (req, res) => {
  const revision = revisionOf(req.body), reason = boundedText(req.body.reason, 'เหตุผล', true, 1000);
  const found = await prisma.supplierBillSettlement.findUnique({ where: { id: req.params.settlementId } });
  if (!found || found.billId !== req.params.id) invalid('ไม่พบรายการตัดชำระ', 404);
  res.json(presentBill(await prisma.$transaction(async tx => {
    await lockVouchers(tx, [found.paymentVoucherId]);
    const previous = await lockBill(tx, req.params.id, revision);
    const settlement = previous.settlements.find(row => row.id === found.id);
    if (!settlement || settlement.status !== 'active') invalid('รายการตัดชำระถูกยกเลิกแล้ว', 409);
    await tx.supplierBillSettlement.update({ where: { id: settlement.id }, data: { status: 'voided', voidedById: req.user.id,
      voidedAt: new Date(), voidReason: reason } });
    const bill = await tx.supplierBill.update({ where: { id: previous.id }, data: { revision: { increment: 1 } }, include: BILL_INCLUDE });
    await billAudit(tx, req, 'unsettle', previous, bill, reason);
    return bill;
  })));
}));

module.exports = router;