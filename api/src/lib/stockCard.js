const { invalid } = require('./deliveryOrder');

function dateOnly(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(`${label}ไม่ถูกต้อง`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 1900) {
    invalid(`${label}ต้องเป็นวันที่จริง`);
  }
  return value;
}

function dateRange(query) {
  const from = dateOnly(query.from, 'วันที่เริ่มต้น');
  const to = dateOnly(query.to, 'วันที่สิ้นสุด');
  if (from > to) invalid('วันที่เริ่มต้นต้องไม่หลังวันที่สิ้นสุด');
  return {
    from,
    to,
    start: new Date(`${from}T00:00:00+07:00`),
    end: new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 86400000),
  };
}

function optionalId(query, key, label) {
  const value = query[key];
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > 100) invalid(`${label}ไม่ถูกต้อง`);
  return value.trim();
}

function milli(value) {
  const match = /^(-?)(\d+)(?:\.(\d{1,3}))?$/.exec(String(value));
  if (!match) invalid('พบจำนวนสินค้าใน Movement ที่ไม่ถูกต้อง', 409);
  const amount = Number(match[2]) * 1000 + Number((match[3] || '').padEnd(3, '0'));
  const result = match[1] ? -amount : amount;
  if (!Number.isSafeInteger(result)) invalid('ยอดสินค้าในรายงานเกินช่วงที่รองรับ', 409);
  return result;
}

function quantity(value) {
  if (!Number.isSafeInteger(value)) invalid('ยอดสินค้าในรายงานเกินช่วงที่รองรับ', 409);
  return (value / 1000).toFixed(3);
}

function keyOf(productId, warehouseId) {
  return `${productId}\u0000${warehouseId}`;
}

async function stockCard(prisma, query) {
  const range = dateRange(query);
  const productId = optionalId(query, 'productId', 'สินค้า');
  const warehouseId = optionalId(query, 'warehouseId', 'คลัง');
  const dimensions = { ...(productId ? { productId } : {}), ...(warehouseId ? { warehouseId } : {}) };
  const [opening, movements] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ['productId', 'warehouseId'],
      where: { ...dimensions, transactionDate: { lt: range.start } },
      _sum: { qtyIn: true, qtyOut: true },
    }),
    prisma.stockMovement.findMany({
      where: { ...dimensions, transactionDate: { gte: range.start, lt: range.end } },
      include: { product: true, warehouse: true },
      orderBy: [{ transactionDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const summaries = new Map();
  function ensureSummary(product, warehouse) {
    const key = keyOf(product.id, warehouse.id);
    let summary = summaries.get(key);
    if (!summary) {
      summary = { productId: product.id, warehouseId: warehouse.id, product, warehouse,
        openingQty: 0, qtyIn: 0, qtyOut: 0, closingQty: 0 };
      summaries.set(key, summary);
    }
    return summary;
  }

  const balances = new Map();
  const [products, warehouses] = await Promise.all([
    prisma.accountProduct.findMany({ where: { id: { in: [...new Set(opening.map(row => row.productId))] } } }),
    prisma.warehouse.findMany({ where: { id: { in: [...new Set(opening.map(row => row.warehouseId))] } } }),
  ]);
  const productById = new Map(products.map(row => [row.id, row]));
  const warehouseById = new Map(warehouses.map(row => [row.id, row]));
  for (const row of opening) {
    const openingQty = milli(row._sum.qtyIn || 0) - milli(row._sum.qtyOut || 0);
    const key = keyOf(row.productId, row.warehouseId);
    balances.set(key, openingQty);
    const product = productById.get(row.productId), warehouse = warehouseById.get(row.warehouseId);
    if (!product || !warehouse) invalid('Movement อ้างอิงสินค้า/คลังที่ไม่พบ ต้องตรวจสอบข้อมูล', 409);
    ensureSummary(product, warehouse).openingQty = openingQty;
  }

  const rows = movements.map(movement => {
    const summary = ensureSummary(movement.product, movement.warehouse);
    const key = keyOf(movement.productId, movement.warehouseId);
    const before = balances.has(key) ? balances.get(key) : 0;
    const qtyIn = milli(movement.qtyIn);
    const qtyOut = milli(movement.qtyOut);
    const after = before + qtyIn - qtyOut;
    if (!Number.isSafeInteger(after)) invalid('ยอดสินค้าในรายงานเกินช่วงที่รองรับ', 409);
    balances.set(key, after);
    summary.qtyIn += qtyIn;
    summary.qtyOut += qtyOut;
    summary.closingQty = after;
    return { ...movement, openingQty: quantity(before), runningQty: quantity(after) };
  });

  for (const summary of summaries.values()) {
    const key = keyOf(summary.productId, summary.warehouseId);
    summary.closingQty = balances.has(key) ? balances.get(key) : summary.openingQty;
    summary.openingQty = quantity(summary.openingQty);
    summary.qtyIn = quantity(summary.qtyIn);
    summary.qtyOut = quantity(summary.qtyOut);
    summary.closingQty = quantity(summary.closingQty);
  }
  return {
    from: range.from,
    to: range.to,
    rows,
    summaries: [...summaries.values()].sort((a, b) =>
      String(a.warehouse.name).localeCompare(String(b.warehouse.name)) ||
      String(a.product.code).localeCompare(String(b.product.code))),
  };
}

module.exports = { dateRange, milli, quantity, stockCard };
