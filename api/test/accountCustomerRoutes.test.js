const test = require('node:test');
const assert = require('node:assert/strict');
const { createCustomerApp } = require('./helpers/accountCustomerApp');

test('Customer and Sale HTTP flows persist edits, enforce permissions and snapshot Invoice defaults', async t => {
  const original = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'isolated-accounting-customer-tests';
  t.after(() => { if (original === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = original; });
  const fixture = createCustomerApp();
  const server = fixture.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = (path, method = 'GET', body, user = 'admin') => fetch(`${base}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${fixture.token(user)}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const path of ['/account-customers', '/account-sales', '/ar/invoices']) {
    assert.equal((await request(path, 'GET', undefined, null)).status, 401);
    assert.equal((await request(path, 'POST', {}, 'viewer')).status, 403);
  }
  const saleResponse = await request('/account-sales', 'POST', { code: 'S001', name: 'Accounting Sale', tel: '123', email: 'sale@example.test' });
  assert.equal(saleResponse.status, 201);
  const sale = await saleResponse.json();
  const saleUpdate = await request(`/account-sales/${sale.id}`, 'PUT', { ...sale, name: 'Sale edited' });
  assert.equal(saleUpdate.status, 200);
  assert.equal((await (await request('/account-sales')).json())[0].name, 'Sale edited');
  assert.equal((await request('/account-sales', 'POST', { code: 'S001', name: 'Duplicate' })).status, 409);
  assert.equal((await request(`/account-sales/${sale.id}`, 'PUT', sale)).status, 409);
  const payload = {
    code: 'C001', name: 'Customer', taxId: '123', responsibleSaleId: sale.id,
    creditTerm: 0, vatConfig: 'NO_VAT', contactPerson: 'Contact', tel: '456', email: 'customer@example.test',
    branches: [{ code: '00000', name: 'Main', addresses: [
      { label: 'Billing', kind: 'billing', address: 'Bill A' }, { label: 'Shipping', kind: 'shipping', address: 'Ship A' },
    ] }, { code: '00001', name: 'Second', addresses: [{ label: 'Both', kind: 'both', address: 'Second address' }] }],
  };
  const created = await request('/account-customers', 'POST', payload);
  assert.equal(created.status, 201);
  const customer = await created.json();
  assert.equal(customer.creditTerm, 0);
  assert.equal(customer.responsibleSale.name, 'Sale edited');
  assert.equal(customer.branches.length, 2);
  assert.equal((await (await request(`/account-customers/${customer.id}`)).json()).branches[0].addresses[1].address, 'Ship A');
  assert.equal((await request('/account-customers', 'POST', payload)).status, 409);
  assert.equal((await request(`/account-customers/${customer.id}`, 'PUT', { ...customer, creditTerm: -1 })).status, 400);
  assert.equal((await request(`/account-customers/${customer.id}`, 'PUT', { ...customer, name: 'No access' }, 'viewer')).status, 403);
  const customer2 = await (await request('/account-customers', 'POST', { ...payload, code: 'C002' })).json();
  const badBranches = structuredClone(customer.branches);
  badBranches[0].addresses[0].id = customer2.branches[0].addresses[0].id;
  assert.equal((await request(`/account-customers/${customer.id}`, 'PUT', { ...customer, branches: badBranches })).status, 400);
  const invoicePayload = {
    customerId: customer.id, customerBranchId: customer.branches[1].id,
    billingAddressId: customer.branches[1].addresses[0].id, shippingAddressId: customer.branches[1].addresses[0].id,
    ivDate: '2026-10-21', subTotal: 100, items: [{ desc: 'Item', qty: 1, unitPrice: 100, amount: 100 }],
  };
  assert.equal((await request('/ar/invoices', 'POST', { ...invoicePayload, customerBranchId: customer2.branches[0].id }, 'ar')).status, 400);
  const invoiceResponse = await request('/ar/invoices', 'POST', invoicePayload, 'ar');
  assert.equal(invoiceResponse.status, 201);
  const invoice = await invoiceResponse.json();
  assert.equal(invoice.customerBranch, 'Second');
  assert.equal(invoice.address, 'Second address');
  assert.equal(invoice.shippingAddress, 'Second address');
  assert.equal(invoice.creditTerm, 0);
  assert.equal(invoice.dueDate.slice(0, 10), '2026-10-21');
  assert.equal(invoice.responsibleSaleId, sale.id);
  assert.equal(invoice.responsibleSaleName, 'Sale edited');
  assert.equal(invoice.salesId, 'ar'); // Legacy creator identity stays separate.
  assert.equal(invoice.vat, 0);
  assert.equal(invoice.netAmount, 100);
  const taxed = await (await request('/ar/invoices', 'POST', { ...invoicePayload, vatConfig: 'VAT7%', creditTerm: 15 }, 'ar')).json();
  assert.equal(taxed.vat, 7);
  assert.equal(taxed.netAmount, 107);
  assert.equal(taxed.dueDate.slice(0, 10), '2026-11-05');
  assert.equal((await request('/account-customers', 'GET', undefined, 'ar')).status, 403);
  const lookup = await (await request('/accounting-access/lookups/customers', 'GET', undefined, 'ar')).json();
  assert.equal(lookup[0].creditTerm, 0);
  assert.equal(lookup[0].branches.length, 2);
  fixture.failAudit(true);
  assert.equal((await request(`/account-customers/${customer.id}`, 'PUT', { ...customer, name: 'Rollback', branches: [customer.branches[0]] })).status, 500);
  fixture.failAudit(false);
  assert.equal((await (await request(`/account-customers/${customer.id}`)).json()).name, 'Customer');
  assert.equal((await (await request(`/account-customers/${customer.id}`)).json()).branches.length, 2);
  const editedResponse = await request(`/account-customers/${customer.id}`, 'PUT', {
    ...customer, name: 'Customer edited', branches: [customer.branches[0]],
  });
  assert.equal(editedResponse.status, 200);
  const edited = await editedResponse.json();
  assert.equal(edited.branches.length, 1);
  assert.equal(edited.branches[0].id, customer.branches[0].id);
  assert.equal((await request(`/account-customers/${customer.id}`, 'PUT', customer)).status, 409);
  assert.equal((await (await request('/ar/invoices')).json())[0].address, 'Second address');
  const inactive = await request(`/account-customers/${customer.id}`, 'PUT', { ...edited, active: false });
  assert.equal(inactive.status, 200);
  assert.equal((await (await request(`/account-customers/${customer.id}`)).json()).active, false);
  assert.equal((await (await request('/accounting-access/lookups/customers', 'GET', undefined, 'ar')).json()).some(c => c.id === customer.id), false);
  assert.equal((await request('/ar/invoices', 'POST', { ...invoicePayload, customerBranchId: edited.branches[0].id }, 'ar')).status, 400);
  assert.ok(fixture.state().audits.some(a => a.entityType === 'account_customer' && a.action === 'update'));
  assert.ok(fixture.state().audits.some(a => a.entityType === 'account_sale' && a.action === 'update'));
  const currentSale = (await (await request('/account-sales')).json())[0];
  assert.equal((await request(`/account-sales/${sale.id}`, 'PUT', { ...currentSale, active: false })).status, 200);
  assert.equal((await request('/account-customers', 'POST', { ...payload, code: 'C003' })).status, 400);
  assert.equal((await request(`/account-customers/${customer2.id}`, 'DELETE', undefined, 'viewer')).status, 403);
  assert.equal((await request(`/account-customers/${customer2.id}`, 'DELETE')).status, 200);
  const deactivated = await (await request(`/account-customers/${customer2.id}`)).json();
  assert.equal(deactivated.active, false);
  assert.equal(deactivated.branches.length, 2);
  assert.equal((await request(`/account-customers/${customer2.id}`, 'PUT', {
    active: true, code: 'C002', updatedAt: deactivated.updatedAt,
  })).status, 200);
  assert.equal((await (await request(`/account-customers/${customer2.id}`)).json()).active, true);
});
