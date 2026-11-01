const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { getPagination, paginated } = require('../lib/pagination');
const { documentType } = require('../lib/accountingApproval');
const { invalid } = require('../lib/deliveryOrder');

router.use(authenticate, async (req, res, next) => {
  try {
    const access = await getAccountingAccess(req.user);
    const modules = ['ar', 'ap', 'inventory'].filter(module => hasAccountingPermission(access, module, 'view'));
    if (!access.allowed || !modules.length) invalid('ไม่มีสิทธิ์อ่านการแจ้งเตือนเอกสาร Accounting', 403);
    req.notificationWhere = { userId: req.user.id, module: { in: modules } };
    next();
  } catch (error) { next(error); }
});
router.get('/', async (req, res, next) => {
  try {
    for (const key of ['page', 'pageSize']) {
      if (req.query[key] !== undefined && (typeof req.query[key] !== 'string' ||
        !/^[1-9]\d*$/.test(req.query[key]) || !Number.isSafeInteger(Number(req.query[key])))) invalid('หน้าหรือขนาดรายการแจ้งเตือนไม่ถูกต้อง');
    }
    const pg = getPagination({ page: '1', pageSize: '25', ...req.query });
    if (!pg) invalid('หน้ารายการแจ้งเตือนไม่ถูกต้อง');
    const [rows, total, unreadCount] = await prisma.$transaction([
      prisma.accountingNotification.findMany({ where: req.notificationWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: pg.skip, take: pg.take }),
      prisma.accountingNotification.count({ where: req.notificationWhere }),
      prisma.accountingNotification.count({ where: { ...req.notificationWhere, readAt: null } }),
    ]);
    const data = rows.map(row => ({
      ...row, href: row.action === 'approval_required'
        ? `/approvals/${encodeURIComponent(row.docType)}/${encodeURIComponent(row.documentId)}`
        : `${documentType(row.docType).href}/${encodeURIComponent(row.documentId)}`,
    }));
    res.json({ ...paginated(data, total, pg), unreadCount });
  } catch (error) { next(error); }
});
router.patch('/read-all', async (req, res, next) => {
  try {
    await prisma.accountingNotification.updateMany({ where: { ...req.notificationWhere, readAt: null }, data: { readAt: new Date() } });
    res.json({ message: 'อ่านการแจ้งเตือนทั้งหมดแล้ว' });
  } catch (error) { next(error); }
});
router.patch('/:id/read', async (req, res, next) => {
  try {
    const result = await prisma.accountingNotification.updateMany({
      where: { ...req.notificationWhere, id: req.params.id }, data: { readAt: new Date() },
    });
    if (!result.count) invalid('ไม่พบการแจ้งเตือนที่คุณมีสิทธิ์อ่าน', 404);
    res.json({ message: 'อ่านการแจ้งเตือนแล้ว' });
  } catch (error) { next(error); }
});
module.exports = router;
