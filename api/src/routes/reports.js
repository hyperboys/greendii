const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { canManageAllQuotations, canManageAllDocs } = require('../lib/roles');

function parseSalesIds(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function normalizeDateRange(rawFrom, rawTo) {
  const where = {};
  if (rawFrom) where.gte = new Date(rawFrom);
  if (rawTo) where.lte = new Date(`${rawTo}T23:59:59.999Z`);
  return Object.keys(where).length > 0 ? where : undefined;
}

function calcAgeDays(isoDate) {
  const start = new Date(isoDate);
  const now = new Date();
  start.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
}

// GET /api/reports/overview
router.get('/overview', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const [
      quoTotal, quoApproved, quoGrandTotal,
      woTotal, woApproved, woPending,
      hoTotal, prTotal, recentLogs,
    ] = await Promise.all([
      prisma.quotation.count({ where: { salesId: userId } }),
      prisma.quotation.count({ where: { salesId: userId, status: 'approved' } }),
      prisma.quotation.aggregate({ _sum: { grandTotal: true }, where: { salesId: userId, status: 'approved' } }),
      prisma.workOrder.count(),
      prisma.workOrder.count({ where: { status: 'approved' } }),
      prisma.workOrder.count({ where: { status: 'pending' } }),
      prisma.handOverJob.count(),
      prisma.purchaseRequest.count(),
      prisma.approvalLog.findMany({
        take: 10,
        orderBy: { actedAt: 'desc' },
        include: { approver: { select: { fullName: true } } },
      }),
    ]);
    res.json({
      quotations: { total: quoTotal, approved: quoApproved, grandTotal: quoGrandTotal._sum.grandTotal || 0 },
      workOrders: { total: woTotal, approved: woApproved, pending: woPending },
      handOverJobs: { total: hoTotal },
      purchaseRequests: { total: prTotal },
      recentLogs,
    });
  } catch (e) { next(e); }
});

// GET /api/reports/sales  — per-customer totals
router.get('/sales', authenticate, async (req, res, next) => {
  try {
    const quotations = await prisma.quotation.findMany({
      where: { active: true, status: { not: 'cancelled' } },
      select: { customerName: true, grandTotal: true, status: true, createdAt: true },
    });
    // Group by customerName
    const map = {};
    for (const q of quotations) {
      if (!map[q.customerName]) map[q.customerName] = { customer: q.customerName, total: 0, approved: 0, count: 0 };
      map[q.customerName].count++;
      map[q.customerName].total += Number(q.grandTotal);
      if (q.status === 'approved') map[q.customerName].approved += Number(q.grandTotal);
    }
    res.json(Object.values(map).sort((a, b) => b.total - a.total));
  } catch (e) { next(e); }
});

// GET /api/reports/approval-performance
router.get('/approval-performance', authenticate, async (req, res, next) => {
  try {
    const logs = await prisma.approvalLog.findMany({
      include: { approver: { select: { id: true, fullName: true, role: true } } },
      orderBy: { actedAt: 'desc' },
    });
    const map = {};
    for (const l of logs) {
      const key = l.approverId;
      if (!map[key]) map[key] = { id: key, name: l.approver.fullName, role: l.approver.role, approve: 0, reject: 0 };
      if (l.action === 'approve') map[key].approve++;
      else map[key].reject++;
    }
    res.json(Object.values(map));
  } catch (e) { next(e); }
});

// GET /api/reports/quotation-summary
// Query: from (ISO date), to (ISO date), salesId (optional, managers only)
router.get('/quotation-summary', authenticate, async (req, res, next) => {
  try {
    const { salesId } = req.query;
    const now = new Date();

    // Default to current month if no date range specified
    const rawFrom = req.query.from;
    const rawTo   = req.query.to;
    const dateFrom = rawFrom ? new Date(rawFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const dateTo   = rawTo   ? new Date(rawTo + 'T23:59:59.999Z') : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const where = {
      active: true,
      createdAt: { gte: dateFrom, lte: dateTo },
    };

    if (!canManageAllQuotations(req.user.role)) {
      // Non-managers only see their own
      where.salesId = req.user.id;
    } else if (salesId) {
      // Managers can filter by specific salesperson
      where.salesId = salesId;
    }

    const quotations = await prisma.quotation.findMany({
      where,
      include: {
        sales: { select: { id: true, fullName: true } },
        items: { select: { desc: true, qty: true, amount: true } },
        _count: { select: { workOrders: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const total = quotations.length;
    const today = new Date();

    // ─── Status counts & totals ───
    const byStatus = { draft: 0, pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    let totalValue = 0;
    let totalSubTotal = 0;
    let totalDiscount = 0;
    let convertedCount = 0; // has linked Work Order = "won"
    let expiredCount = 0;

    for (const q of quotations) {
      byStatus[q.status] = (byStatus[q.status] || 0) + 1;
      totalValue    += Number(q.grandTotal);
      totalSubTotal += Number(q.subTotal);
      totalDiscount += Number(q.specialDiscount);
      if (q._count.workOrders > 0) convertedCount++;

      const expiryDate = new Date(q.createdAt);
      expiryDate.setDate(expiryDate.getDate() + (q.validityDays || 30));
      if (expiryDate < today && ['draft', 'pending'].includes(q.status)) expiredCount++;
    }

    const nonDraftTotal = total - byStatus.draft;
    const winRate      = nonDraftTotal > 0 ? Math.round((convertedCount / nonDraftTotal) * 1000) / 10 : 0;
    const avgDealSize  = total > 0 ? Math.round((totalValue / total) * 100) / 100 : 0;
    const avgDiscountPct = totalSubTotal > 0 ? Math.round((totalDiscount / totalSubTotal) * 1000) / 10 : 0;

    // ─── Status breakdown with value ───
    const statusDetails = {};
    for (const status of ['draft', 'pending', 'approved', 'rejected', 'cancelled']) {
      statusDetails[status] = { count: 0, totalValue: 0 };
    }
    for (const q of quotations) {
      statusDetails[q.status].count++;
      statusDetails[q.status].totalValue += Number(q.grandTotal);
    }

    // ─── Per Salesperson ───
    const salesMap = {};
    for (const q of quotations) {
      const key = q.salesId;
      if (!salesMap[key]) {
        salesMap[key] = {
          salesId: key,
          salesName: q.sales?.fullName || key,
          count: 0, totalValue: 0, wonCount: 0,
          pipelineCount: 0, pipelineValue: 0,
          revisedCount: 0,
        };
      }
      salesMap[key].count++;
      salesMap[key].totalValue += Number(q.grandTotal);
      if (q._count.workOrders > 0)            salesMap[key].wonCount++;
      if (['draft', 'pending'].includes(q.status)) {
        salesMap[key].pipelineCount++;
        salesMap[key].pipelineValue += Number(q.grandTotal);
      }
      if ((q.revisionNo || 0) > 0) salesMap[key].revisedCount++;
    }
    const bySalesperson = Object.values(salesMap).map(s => ({
      ...s,
      totalValue: Math.round(s.totalValue * 100) / 100,
      pipelineValue: Math.round(s.pipelineValue * 100) / 100,
      winRate: s.count > 0 ? Math.round((s.wonCount / s.count) * 1000) / 10 : 0,
    })).sort((a, b) => b.totalValue - a.totalValue);

    // ─── Customer Analysis ───
    const customerMap = {};
    for (const q of quotations) {
      const key = q.customerName;
      if (!customerMap[key]) {
        customerMap[key] = { customerName: key, customerId: q.customerId, count: 0, totalValue: 0, wonCount: 0 };
      }
      customerMap[key].count++;
      customerMap[key].totalValue += Number(q.grandTotal);
      if (q._count.workOrders > 0) customerMap[key].wonCount++;
    }
    const customerList = Object.values(customerMap).map(c => ({
      ...c,
      totalValue: Math.round(c.totalValue * 100) / 100,
      winRate: c.count > 0 ? Math.round((c.wonCount / c.count) * 1000) / 10 : 0,
    })).sort((a, b) => b.totalValue - a.totalValue);
    const top10Customers = customerList.slice(0, 10);

    // New vs returning: first-ever quotation per customer
    const uniqueCustomerIds = [...new Set(quotations.filter(q => q.customerId).map(q => q.customerId))];
    let newCustomers = 0, returningCustomers = 0;
    if (uniqueCustomerIds.length > 0) {
      const earliest = await prisma.quotation.groupBy({
        by: ['customerId'],
        where: { customerId: { in: uniqueCustomerIds } },
        _min: { createdAt: true },
      });
      const firstQuoMap = {};
      for (const r of earliest) {
        if (r.customerId) firstQuoMap[r.customerId] = r._min.createdAt;
      }
      for (const q of quotations.filter(q => q.customerId)) {
        const first = firstQuoMap[q.customerId];
        if (first && first >= dateFrom) newCustomers++;
        else returningCustomers++;
      }
    }

    // Customer type distribution
    let typeDistribution = [];
    if (uniqueCustomerIds.length > 0) {
      const customers = await prisma.customer.findMany({
        where: { id: { in: uniqueCustomerIds } },
        select: { id: true, type: true },
      });
      const typeMap = {};
      for (const c of customers) {
        const t = c.type || 'ไม่ระบุ';
        typeMap[t] = (typeMap[t] || 0) + 1;
      }
      typeDistribution = Object.entries(typeMap).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    }

    // Overdue pipeline: open quotations past validity
    const overdueQuotations = quotations
      .filter(q => {
        if (!['draft', 'pending'].includes(q.status)) return false;
        const expiry = new Date(q.createdAt);
        expiry.setDate(expiry.getDate() + (q.validityDays || 30));
        return expiry < today;
      })
      .map(q => {
        const expiry = new Date(q.createdAt);
        expiry.setDate(expiry.getDate() + (q.validityDays || 30));
        return {
          id: q.id, quoNo: q.quoNo,
          customerName: q.customerName,
          salesName: q.sales?.fullName,
          grandTotal: Number(q.grandTotal),
          expiryDate: expiry,
          status: q.status,
        };
      });

    // ─── Top Items ───
    const itemMap = {};
    for (const q of quotations) {
      for (const item of q.items) {
        const key = item.desc.trim();
        if (!itemMap[key]) itemMap[key] = { desc: key, count: 0, totalAmount: 0 };
        itemMap[key].count++;
        itemMap[key].totalAmount += Number(item.amount);
      }
    }
    const topItems = Object.values(itemMap)
      .map(i => ({ ...i, totalAmount: Math.round(i.totalAmount * 100) / 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // ─── Discount Distribution ───
    const withDiscount = quotations.filter(q => Number(q.specialDiscount) > 0);
    const discountBuckets = [
      { range: '0%',    count: quotations.length - withDiscount.length },
      { range: '1–5%',  count: 0 },
      { range: '6–10%', count: 0 },
      { range: '11–20%',count: 0 },
      { range: '>20%',  count: 0 },
    ];
    for (const q of withDiscount) {
      const pct = Number(q.subTotal) > 0 ? (Number(q.specialDiscount) / Number(q.subTotal)) * 100 : 0;
      if      (pct <= 5)  discountBuckets[1].count++;
      else if (pct <= 10) discountBuckets[2].count++;
      else if (pct <= 20) discountBuckets[3].count++;
      else                discountBuckets[4].count++;
    }

    // ─── Monthly Trend ───
    const monthMap = {};
    for (const q of quotations) {
      const d   = new Date(q.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[key]) monthMap[key] = { month: key, count: 0, totalValue: 0, wonCount: 0 };
      monthMap[key].count++;
      monthMap[key].totalValue += Number(q.grandTotal);
      if (q._count.workOrders > 0) monthMap[key].wonCount++;
    }
    const monthlyTrend = Object.values(monthMap)
      .map(m => ({ ...m, totalValue: Math.round(m.totalValue * 100) / 100 }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // ─── Revision Tracking ───
    const activeRevised  = quotations.filter(q => (q.revisionNo || 0) > 0);
    const totalRevisionNo = activeRevised.reduce((s, q) => s + (q.revisionNo || 0), 0);
    const avgRevisionNo  = activeRevised.length > 0 ? Math.round((totalRevisionNo / activeRevised.length) * 10) / 10 : 0;

    // Count deactivated revisions in the same date range
    const deactivatedRevisionsInRange = await prisma.quotation.count({
      where: {
        active: false,
        revisionNo: { gt: 0 },
        createdAt: { gte: dateFrom, lte: dateTo },
      },
    });

    // ─── Pipeline ───
    const pipelineQs = quotations.filter(q => ['draft', 'pending'].includes(q.status));
    const pipelineValue = Math.round(pipelineQs.reduce((s, q) => s + Number(q.grandTotal), 0) * 100) / 100;

    const soonDate = new Date(today);
    soonDate.setDate(soonDate.getDate() + 7);
    const expiringSoon = pipelineQs
      .filter(q => {
        const expiry = new Date(q.createdAt);
        expiry.setDate(expiry.getDate() + (q.validityDays || 30));
        return expiry >= today && expiry <= soonDate;
      })
      .map(q => {
        const expiry = new Date(q.createdAt);
        expiry.setDate(expiry.getDate() + (q.validityDays || 30));
        return {
          id: q.id, quoNo: q.quoNo,
          customerName: q.customerName,
          salesName: q.sales?.fullName,
          grandTotal: Number(q.grandTotal),
          expiryDate: expiry,
          status: q.status,
        };
      });

    res.json({
      dateRange: { from: dateFrom, to: dateTo },
      overview: {
        total,
        totalValue: Math.round(totalValue * 100) / 100,
        byStatus,
        expiredCount,
        convertedCount,
        winRate,
        avgDealSize,
        avgDiscountPct,
      },
      statusDetails,
      bySalesperson,
      customers: {
        top10: top10Customers,
        newCount: newCustomers,
        returningCount: returningCustomers,
        overdueCount: overdueQuotations.length,
        overdue: overdueQuotations.slice(0, 10),
        typeDistribution,
      },
      topItems,
      discountAnalysis: {
        avgDiscountPct,
        withDiscountCount: withDiscount.length,
        noDiscountCount: quotations.length - withDiscount.length,
        distribution: discountBuckets,
      },
      monthlyTrend,
      revisionTracking: {
        activeRevisedCount: activeRevised.length,
        totalRevisedPct: total > 0 ? Math.round((activeRevised.length / total) * 1000) / 10 : 0,
        avgRevisionNo,
        deactivatedCount: deactivatedRevisionsInRange,
      },
      pipeline: {
        openCount: pipelineQs.length,
        openValue: pipelineValue,
        expiringSoonCount: expiringSoon.length,
        expiringSoon,
        overdueCount: overdueQuotations.length,
        overdue: overdueQuotations.slice(0, 10),
      },
    });
  } catch (e) { next(e); }
});

// GET /api/reports/workorders/no-po-by-sales
// Query: salesIds=comma-separated, from=YYYY-MM-DD, to=YYYY-MM-DD
router.get('/workorders/no-po-by-sales', authenticate, async (req, res, next) => {
  try {
    const salesIds = parseSalesIds(req.query.salesIds);
    const createdAt = normalizeDateRange(req.query.from, req.query.to);
    const where = {
      active: true,
      status: { not: 'cancelled' },
      hasPo: false,
      ...(createdAt ? { createdAt } : {}),
    };

    if (!canManageAllDocs(req.user.role)) {
      where.salesId = req.user.id;
    } else if (salesIds.length > 0) {
      where.salesId = { in: salesIds };
    }

    const workOrders = await prisma.workOrder.findMany({
      where,
      include: {
        sales: { select: { id: true, fullName: true } },
        quotation: { select: { grandTotal: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const summaryMap = {};
    const rows = workOrders.map(wo => {
      const salesId = wo.salesId;
      const salesName = wo.sales?.fullName || salesId;
      if (!summaryMap[salesId]) summaryMap[salesId] = { salesId, salesName, total: 0 };
      summaryMap[salesId].total += 1;
      return {
        id: wo.id,
        woNo: wo.woNo,
        openedAt: wo.createdAt,
        customerName: wo.customerName,
        amount: Number(wo.quotation?.grandTotal || 0),
        ageDays: calcAgeDays(wo.createdAt),
        status: wo.status,
        salesId,
        salesName,
      };
    });

    res.json({ summary: Object.values(summaryMap), rows });
  } catch (e) { next(e); }
});

// GET /api/reports/workorders/po-overview
// Query: salesIds=comma-separated, from, to, customer, poStatus=all|has_po|no_po
router.get('/workorders/po-overview', authenticate, async (req, res, next) => {
  try {
    const salesIds = parseSalesIds(req.query.salesIds);
    const createdAt = normalizeDateRange(req.query.from, req.query.to);
    const customer = String(req.query.customer || '').trim();
    const poStatus = String(req.query.poStatus || 'all');

    const where = {
      active: true,
      status: { not: 'cancelled' },
      ...(createdAt ? { createdAt } : {}),
      ...(customer ? { customerName: { contains: customer, mode: 'insensitive' } } : {}),
      ...(poStatus === 'has_po' ? { hasPo: true } : {}),
      ...(poStatus === 'no_po' ? { hasPo: false } : {}),
    };

    if (!canManageAllDocs(req.user.role)) {
      where.salesId = req.user.id;
    } else if (salesIds.length > 0) {
      where.salesId = { in: salesIds };
    }

    const workOrders = await prisma.workOrder.findMany({
      where,
      include: {
        sales: { select: { id: true, fullName: true } },
        quotation: { select: { grandTotal: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = workOrders.map(wo => ({
      id: wo.id,
      woNo: wo.woNo,
      date: wo.createdAt,
      salesId: wo.salesId,
      salesName: wo.sales?.fullName || wo.salesId,
      customerName: wo.customerName,
      amount: Number(wo.quotation?.grandTotal || 0),
      hasPo: Boolean(wo.hasPo),
      poStatus: wo.hasPo ? 'มี PO แล้ว' : 'ยังไม่มี PO',
      poAttachedDate: wo.poAttachedDate,
      ageDays: calcAgeDays(wo.createdAt),
      status: wo.status,
    }));

    res.json({ rows });
  } catch (e) { next(e); }
});

module.exports = router;
