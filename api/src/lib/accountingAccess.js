const prisma = require('./prisma');

const ACCOUNTING_MODULES = [
  { key: 'ar', label: 'ลูกหนี้ / รับชำระเงิน', actions: ['view', 'create'] },
  { key: 'ap', label: 'เจ้าหนี้ / ค่าใช้จ่าย', actions: ['view', 'create', 'update', 'approve', 'cancel'] },
  { key: 'inventory', label: 'คลังสินค้า / สต็อก', actions: ['view', 'create'] },
  { key: 'master', label: 'ข้อมูลหลัก / ผังบัญชี', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'reports', label: 'รายงานการเงิน', actions: ['view'] },
];
const ALL_PERMISSIONS = ACCOUNTING_MODULES.flatMap(module => module.actions.map(action => `${module.key}.${action}`));

function validateAccountingRole(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > 100) {
    throw Object.assign(new Error('ชื่อบทบาทต้องมีความยาว 1-100 ตัวอักษร'), { status: 400 });
  }
  if (!Array.isArray(body.permissions) || !body.permissions.length ||
      body.permissions.some(permission => !ALL_PERMISSIONS.includes(permission))) {
    throw Object.assign(new Error('กรุณาเลือกสิทธิ์ Accounting ที่ถูกต้องอย่างน้อยหนึ่งรายการ'), { status: 400 });
  }
  const permissions = [...new Set(body.permissions)];
  for (const permission of permissions) {
    const [module, action] = permission.split('.');
    if (action !== 'view' && !permissions.includes(`${module}.view`)) {
      throw Object.assign(new Error(`ต้องให้สิทธิ์ ${module}.view ก่อนให้สิทธิ์ ${permission}`), { status: 400 });
    }
  }
  return { name, permissions };
}

async function getAccountingAccess(user) {
  if (user.role === 'admin') {
    return { allowed: true, isAdmin: true, role: null, permissions: ALL_PERMISSIONS };
  }
  const assignment = await prisma.accountingUserRole.findUnique({
    where: { userId: user.id },
    include: { role: true },
  });
  const permissions = assignment ? assignment.role.permissions.filter(permission => ALL_PERMISSIONS.includes(permission)) : [];
  return {
    allowed: permissions.some(permission => permission.endsWith('.view')),
    isAdmin: false,
    role: assignment ? { id: assignment.role.id, name: assignment.role.name } : null,
    permissions,
  };
}

function hasAccountingPermission(access, module, action) {
  return Boolean(access?.allowed && access.permissions.includes(`${module}.view`) &&
    access.permissions.includes(`${module}.${action}`));
}

module.exports = { ACCOUNTING_MODULES, ALL_PERMISSIONS, validateAccountingRole, getAccountingAccess, hasAccountingPermission };
