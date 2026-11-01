const { invalid } = require('./deliveryOrder');
const { recordAuditLog } = require('./auditTrail');

const GL_ROLES = Object.freeze({
  AR: 'ลูกหนี้การค้า', AP: 'เจ้าหนี้การค้า', SALES: 'รายได้ขาย', CASH: 'เงินสด',
  BANK: 'เงินฝากธนาคาร', VAT_INPUT: 'ภาษีซื้อ', VAT_OUTPUT: 'ภาษีขาย',
  INVENTORY: 'สินค้าคงเหลือ', COGS: 'ต้นทุนขาย', WHT_RECEIVABLE: 'ภาษีหัก ณ ที่จ่ายรับ',
  WHT_PAYABLE: 'ภาษีหัก ณ ที่จ่ายจ่าย', BANK_FEE: 'ค่าธรรมเนียมธนาคาร',
});

function glInput(body) {
  if (!body || Object.keys(body).some(key => !['revision', 'fiscalYearStartMonth', 'mappings', 'policyNotes', 'postingEnabled', 'closingEnabled'].includes(key))) {
    invalid('ข้อมูลตั้งค่า GL ไม่ถูกต้อง');
  }
  if ((body.postingEnabled !== undefined && body.postingEnabled !== false) ||
    (body.closingEnabled !== undefined && body.closingEnabled !== false)) {
    invalid('ยังไม่เปิดลงบัญชีอัตโนมัติหรือปิดงวด ต้องยืนยันกติกาบัญชีและผ่านการตรวจสอบก่อน', 409);
  }
  if (!Number.isInteger(body.revision) || body.revision < 0 ||
    !Number.isInteger(body.fiscalYearStartMonth) || body.fiscalYearStartMonth < 1 || body.fiscalYearStartMonth > 12 ||
    !Array.isArray(body.mappings) || body.mappings.length > Object.keys(GL_ROLES).length) invalid('Revision เดือนเริ่มปีบัญชี หรือรายการ Mapping ไม่ถูกต้อง');
  if (typeof body.policyNotes !== 'string' || body.policyNotes.length > 4000) invalid('หมายเหตุนโยบายต้องไม่เกิน 4000 ตัวอักษร');
  const roles = new Set();
  const mappings = body.mappings.map(mapping => {
    if (!mapping || Object.keys(mapping).some(key => !['role', 'accountId'].includes(key)) ||
      !Object.hasOwn(GL_ROLES, mapping.role) || typeof mapping.accountId !== 'string' ||
      !mapping.accountId.trim() || mapping.accountId.length > 100 || roles.has(mapping.role)) invalid('Mapping ต้องเป็นหน้าที่บัญชีที่รองรับ ไม่ซ้ำ และระบุบัญชี');
    roles.add(mapping.role);
    return { role: mapping.role, accountId: mapping.accountId.trim() };
  });
  return { revision: body.revision, fiscalYearStartMonth: body.fiscalYearStartMonth, policyNotes: body.policyNotes.trim(), mappings };
}

function glView(config) {
  return {
    revision: config?.revision || 0, fiscalYearStartMonth: config?.fiscalYearStartMonth || 1,
    mappings: config?.mappings || [], policyNotes: config?.policyNotes || "",
    updatedAt: config?.updatedAt || null, postingEnabled: false, closingEnabled: false,
  };
}

async function saveGl(tx, input, req) {
  await tx.accountingGlConfiguration.createMany({ data: [{ id: 'main', revision: 0, mappings: [] }], skipDuplicates: true });
  await tx.$queryRaw`SELECT id FROM accounting_gl_configuration WHERE id = 'main' FOR UPDATE`;
  const previous = await tx.accountingGlConfiguration.findUnique({ where: { id: 'main' } });
  if (previous.revision !== input.revision) invalid('ตั้งค่า GL เปลี่ยนแล้ว กรุณาโหลดข้อมูลใหม่', 409);
  const ids = [...new Set(input.mappings.map(mapping => mapping.accountId))].sort();
  if (ids.length) await tx.$queryRaw`SELECT id FROM chart_of_accounts WHERE id = ANY(${ids}::text[]) ORDER BY id FOR SHARE`;
  const accounts = ids.length ? await tx.chartOfAccount.findMany({ where: { id: { in: ids } } }) : [];
  const byId = new Map(accounts.map(account => [account.id, account]));
  const mappings = input.mappings.map(mapping => {
    const account = byId.get(mapping.accountId);
    if (!account?.active || account.accountType !== 'detail') invalid('Mapping ต้องใช้บัญชีย่อยที่เปิดใช้งานเท่านั้น', 409);
    return { ...mapping, code: account.code, name: account.name };
  });
  const saved = await tx.accountingGlConfiguration.update({
    where: { id: 'main' },
    data: { fiscalYearStartMonth: input.fiscalYearStartMonth, policyNotes: input.policyNotes, mappings, revision: previous.revision + 1 },
  });
  await recordAuditLog({
    entityType: 'accounting_gl_configuration', entityId: 'main', action: 'update',
    oldValue: glView(previous), newValue: glView(saved), req,
  }, tx);
  return glView(saved);
}

module.exports = { GL_ROLES, glInput, glView, saveGl };
