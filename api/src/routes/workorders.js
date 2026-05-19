const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { notifyStep, notifyUser } = require('../lib/notify');
const { getFirstStep, getNextStep } = require('../lib/approvalFlow');

const INCLUDE_FULL = {
  sales: { select: { id: true, fullName: true, initials: true } },
  quotation: { select: { id: true, quoNo: true } },
  approvalLogs: {
    include: { approver: { select: { id: true, fullName: true, role: true } } },
    orderBy: { actedAt: 'asc' },
  },
  attachments: true,
};

// GET /api/workorders
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { status, salesId, isClosed, q } = req.query;
    const where = {};
    if (status) where.status = status;
    if (salesId) where.salesId = salesId;
    if (isClosed !== undefined) where.isClosed = isClosed === 'true';
    if (q) where.OR = [
      { woNo: { contains: q, mode: 'insensitive' } },
      { project: { contains: q, mode: 'insensitive' } },
      { customerName: { contains: q, mode: 'insensitive' } },
    ];
    const managerRoles = ['sale_mgr', 'admin_mgr', 'project_mgr', 'director', 'procurement', 'factory'];
    if (!managerRoles.includes(req.user.role)) where.salesId = req.user.id;

    const list = await prisma.workOrder.findMany({
      where,
      include: { sales: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(list);
  } catch (e) { next(e); }
});

// GET /api/workorders/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.workOrder.findUniqueOrThrow({
      where: { id: req.params.id },
      include: INCLUDE_FULL,
    });
    res.json(item);
  } catch (e) { next(e); }
});

// POST /api/workorders
router.post('/', authenticate, async (req, res, next) => {
  try {
    const {
      quotationId, project, location, products, responsibility,
      customerName, contactName, contactTel, teamAssignment,
      qcDate, installDate, remark, docChecklist,
    } = req.body;
    if (!project || !customerName) {
      return res.status(400).json({ message: 'project and customerName required' });
    }
    const yy = String(new Date().getFullYear()).slice(2);
    const lastWO = await prisma.workOrder.findFirst({
      where: { woNo: { startsWith: `WO${yy}` } },
      orderBy: { woNo: 'desc' },
    });
    const seq = lastWO ? (parseInt(lastWO.woNo.replace(`WO${yy}`, ''), 10) || 0) + 1 : 1;
    const woNo = `WO${yy}${String(seq).padStart(3, '0')}`;
    const wo = await prisma.workOrder.create({
      data: {
        woNo, quotationId, project, location, products, responsibility,
        customerName, contactName, contactTel, teamAssignment,
        qcDate: qcDate ? new Date(qcDate) : null,
        installDate: installDate ? new Date(installDate) : null,
        remark, docChecklist: docChecklist || {},
        salesId: req.user.id, status: 'draft',
      },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: 0,
        action: 'submit', comment: 'สร้างใบสั่งงาน',
      },
    });
    res.status(201).json(wo);
  } catch (e) { next(e); }
});

// PUT /api/workorders/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const existing = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.isClosed) return res.status(400).json({ message: 'Work order is closed' });
    const managerRoles = ['sale_mgr', 'admin_mgr', 'project_mgr', 'director', 'procurement', 'factory', 'admin'];
    if (existing.salesId !== req.user.id && !managerRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์แก้ไขเอกสารของผู้อื่น' });
    }
    const {
      project, location, products, responsibility,
      customerName, contactName, contactTel, teamAssignment,
      qcDate, installDate, remark, docChecklist,
    } = req.body;
    const wo = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: {
        project, location, products, responsibility,
        customerName, contactName, contactTel, teamAssignment,
        qcDate: qcDate ? new Date(qcDate) : null,
        installDate: installDate ? new Date(installDate) : null,
        remark, docChecklist: docChecklist || existing.docChecklist,
      },
    });
    res.json(wo);
  } catch (e) { next(e); }
});

// DELETE /api/workorders/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    const managerRoles = ['admin', 'director', 'admin_mgr'];
    if (wo.salesId !== req.user.id && !managerRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์ลบเอกสารของผู้อื่น' });
    }
    if (!['draft', 'rejected'].includes(wo.status)) {
      return res.status(400).json({ message: 'ลบได้เฉพาะเอกสารที่อยู่ในสถานะ Draft หรือ Rejected เท่านั้น' });
    }
    await prisma.workOrder.update({
      where: { id: req.params.id },
      data: { status: 'cancelled' },
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/workorders/:id/submit
router.post('/:id/submit', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!['draft', 'rejected'].includes(wo.status)) return res.status(400).json({ message: 'ส่งได้เฉพาะ Draft หรือ Rejected เท่านั้น' });
    const firstStep = await getFirstStep('workOrder');
    const updated = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: { status: 'pending', approvalStep: firstStep },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: 0,
        action: 'submit', comment: req.body.comment || 'ส่งเข้าอนุมัติ',
      },
    });
    await notifyStep(firstStep, `ใบสั่งงาน ${wo.woNo} รอการอนุมัติจากคุณ`).catch(() => {});
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/workorders/:id/approve
router.post('/:id/approve', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (wo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const nextStep = await getNextStep('workOrder', wo.approvalStep);
    const newStatus = nextStep === null ? 'approved' : 'pending';
    const isClosed = nextStep === null;
    const updated = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: {
        approvalStep: nextStep ?? wo.approvalStep, status: newStatus,
        isClosed, closedAt: isClosed ? new Date() : null,
      },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: wo.approvalStep,
        action: 'approve', comment: req.body.comment || '',
      },
    });
    if (newStatus === 'approved') {
      await notifyUser(wo.salesId, `ใบสั่งงาน ${wo.woNo} ได้รับการอนุมัติแล้ว`).catch(() => {});
    } else {
      await notifyStep(nextStep, `ใบสั่งงาน ${wo.woNo} รอการอนุมัติจากคุณ`).catch(() => {});
    }
    res.json(updated);
  } catch (e) { next(e); }
});

// POST /api/workorders/:id/reject
router.post('/:id/reject', authenticate, async (req, res, next) => {
  try {
    const wo = await prisma.workOrder.findUniqueOrThrow({ where: { id: req.params.id } });
    if (wo.status !== 'pending') return res.status(400).json({ message: 'Not pending' });
    const updated = await prisma.workOrder.update({
      where: { id: req.params.id },
      data: { status: 'rejected' },
    });
    await prisma.approvalLog.create({
      data: {
        docType: 'workorder', workOrderId: wo.id,
        approverId: req.user.id, step: wo.approvalStep,
        action: 'reject', comment: req.body.comment || '',
      },
    });
    await notifyUser(wo.salesId, `ใบสั่งงาน ${wo.woNo} ถูกปฏิเสธ`).catch(() => {});
    res.json(updated);

  } catch (e) { next(e); }
});

module.exports = router;
