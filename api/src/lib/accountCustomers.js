const CUSTOMER_INCLUDE = {
  responsibleSale: true,
  secondarySales: { orderBy: { position: 'asc' }, include: { sale: true } },
  branches: { orderBy: { position: 'asc' }, include: { addresses: { orderBy: { position: 'asc' } } } },
};
const VAT_CONFIGS = ['VAT7%', 'NO_VAT'];
function invalid(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
function text(value, label, required = false) {
  if (value != null && typeof value !== 'string') invalid(`${label} ไม่ถูกต้อง`);
  const result = value?.trim() || null;
  if (required && !result) invalid(`กรุณาระบุ${label}`);
  return result;
}
function creditDays(value) {
  if (value === null || !['string', 'number'].includes(typeof value) || (typeof value === 'string' && !value.trim())) invalid('Credit Term ไม่ถูกต้อง');
  const days = Number(value);
  if (!Number.isSafeInteger(days) || days < 0 || days > 2147483647) invalid('Credit Term ต้องเป็นจำนวนเต็มไม่ติดลบและอยู่ในช่วงที่ฐานข้อมูลรองรับ');
  return days;
}
function activeStatus(value = true) {
  if (typeof value !== 'boolean') invalid('สถานะใช้งานไม่ถูกต้อง');
  return value;
}
function vatSetting(value = 'VAT7%') {
  if (!VAT_CONFIGS.includes(value)) invalid('การตั้งค่า VAT ไม่ถูกต้อง');
  return value;
}
const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
// Accepts one or more addresses separated by comma/semicolon; stored normalized as "a@x.com, b@y.com".
function email(value) {
  const result = text(value, 'อีเมล');
  if (!result) return null;
  const parts = result.split(/[,;]/).map(part => part.trim()).filter(Boolean);
  if (!parts.length || parts.some(part => !EMAIL_PATTERN.test(part))) invalid('อีเมลไม่ถูกต้อง');
  return parts.join(', ');
}
function taxId(value, overseas = false) {
  const result = text(value, 'Tax ID');
  if (result && !overseas && !/^\d{13}$/.test(result)) invalid('Tax ID ในประเทศต้องเป็นตัวเลข 13 หลัก');
  return result;
}
function saleIds(value, primaryId) {
  if (!Array.isArray(value) || value.some(id => typeof id !== 'string' || !id.trim())) invalid('Sale รองไม่ถูกต้อง');
  const ids = value.map(id => id.trim());
  if (new Set(ids).size !== ids.length) invalid('Sale รองซ้ำ');
  if (primaryId && ids.includes(primaryId)) invalid('Sale รองต้องไม่ซ้ำกับ Sale หลัก');
  return ids;
}
function validateSale(body) {
  return {
    code: text(body.code, 'รหัส Sale', true),
    name: text(body.name, 'ชื่อ Sale', true),
    tel: text(body.tel, 'โทรศัพท์'), email: email(body.email), active: activeStatus(body.active),
  };
}
function validateCustomer(body, previous = null) {
  const merged = { ...previous, ...body };
  const data = {
    code: text(merged.code, 'รหัสลูกค้า', true), name: text(merged.name, 'ชื่อลูกค้า', true),
    taxId: taxId(merged.taxId), type: text(merged.type ?? 'นิติบุคคล', 'ประเภทลูกค้า', true),
    contactPerson: text(merged.contactPerson, 'ผู้ติดต่อ'), tel: text(merged.tel, 'โทรศัพท์'),
    fax: text(merged.fax, 'แฟกซ์'),
    email: email(merged.email), responsibleSaleId: text(merged.responsibleSaleId, 'Sale ผู้ดูแล'),
    vatConfig: vatSetting(merged.vatConfig === undefined ? 'VAT7%' : merged.vatConfig),
    creditTerm: creditDays(merged.creditTerm === undefined ? 30 : merged.creditTerm), active: activeStatus(merged.active),
  };
  if (body.secondarySaleIds !== undefined) data.secondarySaleIds = saleIds(body.secondarySaleIds, data.responsibleSaleId);
  else if (previous?.secondarySales?.some(s => s.saleId === data.responsibleSaleId)) {
    invalid('Sale หลักซ้ำกับ Sale รอง กรุณาระบุ Sale รองใหม่');
  }
  if (body.branches === undefined && previous) {
    if (['branch', 'address', 'billingAddress', 'shippingAddress'].some(key => body[key] !== undefined)) {
      invalid('กรุณาแก้ไขสาขาและที่อยู่ผ่าน branches แทนช่องที่อยู่แบบเดิม');
    }
    return data;
  }
  const branches = body.branches;
  if (!Array.isArray(branches) || !branches.length) invalid('กรุณาระบุสาขาอย่างน้อยหนึ่งสาขา');
  data.branches = branches.map(branch => {
    if (!branch || typeof branch !== 'object') invalid('ข้อมูลสาขาไม่ถูกต้อง');
    if (!Array.isArray(branch.addresses)) invalid('ข้อมูลที่อยู่ของสาขาไม่ถูกต้อง');
    return {
      id: text(branch.id, 'รหัสอ้างอิงสาขา'),
      code: text(branch.code, 'รหัสสาขา', true), name: text(branch.name, 'ชื่อสาขา', true),
      contactPerson: text(branch.contactPerson, 'ผู้ติดต่อสาขา'), tel: text(branch.tel, 'โทรศัพท์สาขา'),
      fax: text(branch.fax, 'แฟกซ์สาขา'), email: email(branch.email),
      addresses: branch.addresses.map(address => {
        if (!address || !['billing', 'shipping', 'both'].includes(address.kind)) invalid('ประเภทที่อยู่ไม่ถูกต้อง');
        return {
          id: text(address.id, 'รหัสอ้างอิงที่อยู่'),
          label: text(address.label, 'ชื่อที่อยู่', true), kind: address.kind,
          address: text(address.address, 'ที่อยู่', true),
        };
      }),
    };
  });
  if (new Set(data.branches.map(b => b.code)).size !== data.branches.length) invalid('รหัสสาขาซ้ำ');
  const first = data.branches[0];
  data.branch = first.name;
  data.address = first.addresses[0]?.address ?? null;
  data.billingAddress = first.addresses.find(a => a.kind === 'billing')?.address ??
    first.addresses.find(a => a.kind === 'both')?.address ?? null;
  data.shippingAddress = first.addresses.find(a => a.kind === 'shipping')?.address ??
    first.addresses.find(a => a.kind === 'both')?.address ?? null;
  return data;
}

function invoiceCustomerDefaults(customer, body) {
  if (!customer) invalid('ไม่พบลูกค้า', 404);
  if (!customer.active) invalid('ลูกค้าถูกปิดใช้งาน');
  const branches = customer.branches || [];
  let branch = body.customerBranchId ? branches.find(b => b.id === body.customerBranchId) : branches[0];
  if (body.customerBranchId && !branch) invalid('สาขาไม่ใช่ของลูกค้าที่เลือก กรุณาโหลดข้อมูลใหม่');
  if (!body.customerBranchId && body.customerBranch && branches.length) {
    const matches = branches.filter(b => b.name === body.customerBranch || b.code === body.customerBranch);
    if (matches.length !== 1) invalid('กรุณาเลือกสาขาลูกค้าด้วย customerBranchId ที่ถูกต้อง');
    branch = matches[0];
  }
  const pickAddress = (id, kind) => {
    const addresses = branch?.addresses || [];
    const address = id ? addresses.find(a => a.id === id && [kind, 'both'].includes(a.kind))
      : addresses.find(a => a.kind === kind) || addresses.find(a => a.kind === 'both');
    if (id && !address) invalid('ที่อยู่ไม่ตรงกับสาขาหรือประเภทที่เลือก กรุณาโหลดข้อมูลใหม่');
    return address?.address;
  };
  return {
    customerBranch: branch?.name || body.customerBranch || customer.branch || 'สำนักงานใหญ่',
    taxId: body.taxId ?? customer.taxId,
    address: body.billingAddressId ? pickAddress(body.billingAddressId, 'billing')
      : body.address ?? pickAddress(null, 'billing') ?? (branch ? null : customer.billingAddress ?? customer.address),
    shippingAddress: body.shippingAddressId ? pickAddress(body.shippingAddressId, 'shipping')
      : body.shippingAddress ?? pickAddress(null, 'shipping') ?? (branch ? null : customer.shippingAddress),
    responsibleSaleId: customer.responsibleSale?.active ? customer.responsibleSaleId : null,
    responsibleSaleName: customer.responsibleSale?.active ? customer.responsibleSale.name : null,
    creditTerm: creditDays(body.creditTerm === undefined ? customer.creditTerm ?? 30 : body.creditTerm),
    vatConfig: vatSetting(body.vatConfig === undefined ? customer.vatConfig ?? 'VAT7%' : body.vatConfig),
  };
}

module.exports = { CUSTOMER_INCLUDE, validateCustomer, validateSale, invoiceCustomerDefaults, email, taxId };
