const { milli } = require('./stockCard');
const { average, fixed } = require('./stockCost');
async function inventoryBalances(tx, where = {}) {
  const [balances, states] = await Promise.all([
    tx.stockBalance.findMany({ where, include: { product: true, warehouse: true }, orderBy: [{ warehouseId: 'asc' }, { productId: 'asc' }] }),
    tx.stockValuation.findMany({ where }),
  ]);
  const index = new Map(states.map(state => [`${state.warehouseId}:${state.productId}`, state]));
  return balances.map(row => {
    const state = index.get(`${row.warehouseId}:${row.productId}`);
    const valid = state?.status === 'valued' && milli(state.quantity) === milli(row.onHand);
    return { ...row, lowStock: row.lowStockThreshold != null && milli(row.available) <= milli(row.lowStockThreshold),
      valuationStatus: valid ? 'valued' : state?.status === 'valued' ? 'blocked' : 'unvalued',
      totalValue: valid ? state.totalValue : null, averageCost: valid ? fixed(average(state.totalValue, state.quantity)) : null,
      valuationRevision: state?.revision || null, costProvenance: state?.provenance || null };
  });
}
module.exports = { inventoryBalances };
