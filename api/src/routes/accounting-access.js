const router = require('express').Router();
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { ACCOUNTING_MODULES, validateAccountingRole, getAccountingAccess, hasAccountingPermission } = require('../lib/accountingAccess');
const { CUSTOMER_INCLUDE } = require('../lib/accountCustomers');

router.use(authenticate);

router.get('/me', async (req, res, next) => {
  try {
    res.json(await getAccountingAccess(req.user));
  } catch (error) { next(error); }
});

const LOOKUPS = {
  customers: { model: 'accountCustomer', modules: ['ar'] },
  suppliers: { model: 'supplier', modules: ['ap'] },
  products: { model: 'accountProduct', modules: ['inventory'] },
  warehouses: { model: 'warehouse', modules: ['inventory'] },
};

router.get('/lookups/:kind', async (req, res, next) => {
  try {
    const lookup = Object.hasOwn(LOOKUPS, req.params.kind) ? LOOKUPS[req.params.kind] : null;
    if (!lookup) return res.status(404).json({ message: 'ไม่พบประเภทข้อมูลอ้างอิง' });
    const access = await getAccountingAccess(req.user);
    const canUseLookup = lookup.modules.some(module =>
      hasAccountingPermission(access, module, 'create') || hasAccountingPermission(access, module, 'update'));
    if (!canUseLookup) {
      return res.status(403).json({ message: 'ไม่มีสิทธิ์ใช้ข้อมูลอ้างอิง Accounting' });
    }
    res.json(await prisma[lookup.model].findMany({
      where: { active: true },
      ...(req.params.kind === 'customers'
        ? { include: CUSTOMER_INCLUDE }
        : req.params.kind === 'suppliers'
          ? {
            select: {
              id: true, code: true, name: true, taxId: true, branch: true, address: true,
              billingAddress: true, contactPerson: true, tel: true, email: true,
              vatConfig: true, paymentTerm: true, supplierType: true,
            },
          }
          : { select: { id: true, code: true, name: true } }),
      orderBy: { name: 'asc' },
    }));
  } catch (error) { next(error); }
});

router.use(requireRole('admin'));

router.get('/roles', async (_req, res, next) => {
  try {
    const roles = await prisma.accountingRole.findMany({
      include: { _count: { select: { assignments: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ modules: ACCOUNTING_MODULES, roles });
  } catch (error) { next(error); }
});

router.post('/roles', async (req, res, next) => {
  try {
    res.status(201).json(await prisma.accountingRole.create({ data: validateAccountingRole(req.body) }));
  } catch (error) { next(error); }
});

router.put('/roles/:id', async (req, res, next) => {
  try {
    res.json(await prisma.accountingRole.update({
      where: { id: req.params.id }, data: validateAccountingRole(req.body),
    }));
  } catch (error) { next(error); }
});

router.delete('/roles/:id', async (req, res, next) => {
  try {
    const count = await prisma.accountingUserRole.count({ where: { roleId: req.params.id } });
    if (count) return res.status(409).json({ message: 'ยังมีผู้ใช้บทบาทนี้ กรุณาถอดหรือเปลี่ยนบทบาทผู้ใช้ก่อนลบ' });
    await prisma.accountingRole.delete({ where: { id: req.params.id } });
    res.json({ message: 'ลบบทบาท Accounting แล้ว' });
  } catch (error) { next(error); }
});

router.get('/users', async (_req, res, next) => {
  try {
    res.json(await prisma.user.findMany({
      select: {
        id: true, username: true, fullName: true, role: true, active: true,
        accountingAssignment: { select: { roleId: true } },
      },
      orderBy: { username: 'asc' },
    }));
  } catch (error) { next(error); }
});

router.post('/users', async (req, res, next) => {
  try {
    const {
      username, password, fullName, initials, email, phone, department, position,
      lineUserId, firstName, lastName, firstNameEn, lastNameEn, roleId,
    } = req.body || {};
    const normalizedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedFullName = typeof fullName === 'string' ? fullName.trim() : '';
    if (!normalizedUsername || !normalizedFullName || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ message: 'กรุณาระบุ username, fullName และรหัสผ่านอย่างน้อย 6 ตัวอักษร' });
    }
    if (typeof roleId !== 'string' || !roleId.trim()) {
      return res.status(400).json({ message: 'กรุณาเลือกบทบาท Accounting ให้ผู้ใช้' });
    }
    const optionalText = value => typeof value === 'string' && value.trim() ? value.trim() : null;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async tx => {
      const accountingRole = await tx.accountingRole.findUnique({
        where: { id: roleId.trim() }, select: { id: true },
      });
      if (!accountingRole) throw Object.assign(new Error('ไม่พบบทบาท Accounting'), { status: 404 });
      const created = await tx.user.create({
        data: {
          username: normalizedUsername,
          passwordHash,
          fullName: normalizedFullName,
          initials: optionalText(initials) || '',
          role: 'sales',
          email: optionalText(email),
          phone: optionalText(phone),
          department: optionalText(department),
          position: optionalText(position),
          lineUserId: optionalText(lineUserId),
          firstName: optionalText(firstName),
          lastName: optionalText(lastName),
          firstNameEn: optionalText(firstNameEn),
          lastNameEn: optionalText(lastNameEn),
        },
        select: {
          id: true, username: true, fullName: true, role: true, active: true,
        },
      });
      await tx.accountingUserRole.upsert({
        where: { userId: created.id },
        create: { userId: created.id, roleId: accountingRole.id },
        update: { roleId: accountingRole.id },
      });
      return { ...created, accountingAssignment: { roleId: accountingRole.id } };
    });
    res.status(201).json(user);
  } catch (error) { next(error); }
});

router.put('/users/:id/role', async (req, res, next) => {
  try {
    const roleId = req.body?.roleId;
    if (roleId !== null && (typeof roleId !== 'string' || !roleId.trim())) {
      return res.status(400).json({ message: 'roleId ต้องเป็นรหัสบทบาท หรือ null เพื่อถอดสิทธิ์' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } });
    if (!user) return res.status(404).json({ message: 'ไม่พบผู้ใช้' });
    if (user.role === 'admin') return res.status(400).json({ message: 'admin มีสิทธิ์ Accounting ทั้งหมดอยู่แล้ว' });
    if (roleId === null) {
      await prisma.accountingUserRole.deleteMany({ where: { userId: user.id } });
    } else {
      const role = await prisma.accountingRole.findUnique({ where: { id: roleId }, select: { id: true } });
      if (!role) return res.status(404).json({ message: 'ไม่พบบทบาท Accounting' });
      await prisma.accountingUserRole.upsert({
        where: { userId: user.id },
        create: { userId: user.id, roleId },
        update: { roleId },
      });
    }
    res.json({ message: 'บันทึกบทบาท Accounting แล้ว' });
  } catch (error) { next(error); }
});

module.exports = router;
