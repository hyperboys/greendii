const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { canViewAllReports } = require('../lib/roles');
const { getPrCurrentStageSteps, getStepRoleMapping } = require('../lib/approvalFlow');
const { normalizeRole } = require('../lib/roleAliases');
const { canBypassDocApproval } = require('../lib/approvalBypass');

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

function poAttachmentFilter() {
  return { category: { equals: 'po', mode: 'insensitive' } };
}

function parsePageInt(raw, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function hasUserApprovedOrRejected(pr, userId) {
  return Array.isArray(pr?.approvalLogs)
    && pr.approvalLogs.some(
      log => log?.approverId === userId && ['approve', 'reject'].includes(log?.action),
    );
}

async function getCurrentPrStageRoles(pr, stepRole) {
  const stageSteps = await getPrCurrentStageSteps(
    pr?.prType?.approvalSteps,
    pr?.sales?.role,
    Number(pr?.approvalStep),
  );

  const roles = [...new Set(
    stageSteps
      .map(step => normalizeRole(stepRole[step]))
      .filter(Boolean),
  )];

  return { stageSteps, roles };
}

async function isPendingPrCurrentApprover(user, pr, stepRole) {
  if (!pr || pr.status !== 'pending') return false;

  const actorRole = normalizeRole(user?.role);
  if (!actorRole) return false;

  const { stageSteps, roles } = await getCurrentPrStageRoles(pr, stepRole);
  if (!stageSteps.length || !roles.length) return false;
  if (!roles.includes(actorRole)) return false;

  if (stageSteps.includes(1) && actorRole === 'sales' && pr.salesId === user.id) return false;
  return true;
}

async function isPrAccessibleForUser(user, pr, stepRole) {
  if (!pr) return false;
  if (pr.salesId === user.id) return true;
  if (hasUserApprovedOrRejected(pr, user.id)) return true;
  return isPendingPrCurrentApprover(user, pr, stepRole);
}

async function buildPrAccessWhere(user) {
  if (await canBypassDocApproval('pr', user.role)) return {};

  return {
    OR: [
      { salesId: user.id },
      { status: 'pending' },
      {
        approvalLogs: {
          some: {
            approverId: user.id,
            action: { in: ['approve', 'reject'] },
          },
        },
      },
    ],
  };
}

async function countVisiblePurchaseRequests(user) {
  const where = {
    AND: [
      await buildPrAccessWhere(user),
      { active: true },
    ],
  };

  const list = await prisma.purchaseRequest.findMany({
    where,
    select: {
      id: true,
      salesId: true,
      status: true,
      approvalStep: true,
      sales: { select: { role: true } },
      prType: { select: { approvalSteps: true } },
      approvalLogs: {
        select: { approverId: true, action: true },
      },
    },
  });

  if (await canBypassDocApproval('pr', user.role)) return list.length;

  const { stepRole } = await getStepRoleMapping();
  let visible = 0;
  for (const item of list) {
    if (await isPrAccessibleForUser(user, item, stepRole)) visible += 1;
  }
  return visible;
}

// GET /api/reports/overview
router.get('/overview', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const canSeeAllReports = await canViewAllReports(req.user.role);
    const quotationWhere = canSeeAllReports
      ? { active: true }
      : { salesId: userId, active: true };
    const [
      quoTotal, quoApproved, quoGrandTotal,
      woTotal, woApproved, woPending,
      hoTotal, prTotal, recentLogs,
    ] = await Promise.all([
      prisma.quotation.count({ where: quotationWhere }),
      prisma.quotation.count({ where: { ...quotationWhere, status: 'approved' } }),
      prisma.quotation.aggregate({ _sum: { grandTotal: true }, where: { ...quotationWhere, status: 'approved' } }),
      prisma.workOrder.count(),
      prisma.workOrder.count({ where: { status: 'approved' } }),
      prisma.workOrder.count({ where: { status: 'pending' } }),
      prisma.handOverJob.count(),
      countVisiblePurchaseRequests(req.user),
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

// GET /api/reports/sales-performance
// Query:
// - from=YYYY-MM-DD (default: first day of current month)
// - to=YYYY-MM-DD   (default: last day of current month)
// - salesIds=comma-separated user ids
// - customer=string (optional contains)
// - status=all|has_po|qt_only|no_document
// - page=number (default 1)
// - limit=number (default 50, max 500)
router.get('/sales-performance', authenticate, async (req, res, next) => {
  try {
    const canSeeAllReports = await canViewAllReports(req.user.role);
    const now = new Date();

    const rawFrom = req.query.from;
    const rawTo = req.query.to;
    const dateFrom = rawFrom
      ? new Date(String(rawFrom))
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const dateTo = rawTo
      ? new Date(`${rawTo}T23:59:59.999Z`)
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const salesIds = parseSalesIds(req.query.salesIds);
    const customer = String(req.query.customer || '').trim();
    const statusFilter = String(req.query.status || 'all').trim().toLowerCase();
    const page = parsePageInt(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parsePageInt(req.query.limit, 50, { min: 1, max: 500 });

    const where = {
      active: true,
      createdAt: { gte: dateFrom, lte: dateTo },
      ...(customer ? { customerName: { contains: customer, mode: 'insensitive' } } : {}),
    };

    if (!canSeeAllReports) {
      where.salesId = req.user.id;
    } else if (salesIds.length > 0) {
      where.salesId = { in: salesIds };
    }

    const quotations = await prisma.quotation.findMany({
      where,
      select: {
        id: true,
        quoNo: true,
        createdAt: true,
        customerName: true,
        grandTotal: true,
        status: true,
        salesId: true,
        sales: { select: { id: true, fullName: true } },
        workOrders: {
          where: {
            active: true,
            status: { not: 'cancelled' },
          },
          select: {
            id: true,
            woNo: true,
            attachments: {
              where: poAttachmentFilter(),
              select: {
                id: true,
                originalName: true,
                poAmount: true,
                uploadedAt: true,
              },
              orderBy: { uploadedAt: 'desc' },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { quoNo: 'desc' }],
    });

    const mappedRows = quotations.map((q) => {
      const poEntries = [];
      for (const wo of q.workOrders) {
        for (const att of wo.attachments) {
          poEntries.push({
            workOrderId: wo.id,
            workOrderNo: wo.woNo,
            poName: att.originalName || '',
            poAmount: Number(att.poAmount || 0),
            uploadedAt: att.uploadedAt,
          });
        }
      }

      const hasPo = poEntries.length > 0;
      const poAmount = poEntries.reduce((sum, p) => sum + Number(p.poAmount || 0), 0);
      const qtAmount = Number(q.grandTotal || 0);

      let source = 'None';
      let recognizedAmount = 0;
      if (hasPo) {
        source = 'PO';
        recognizedAmount = poAmount;
      } else if (q.status === 'approved') {
        source = 'QT';
        recognizedAmount = qtAmount;
      }

      const statusKey = hasPo ? 'has_po' : source === 'QT' ? 'qt_only' : 'no_document';
      const firstPo = poEntries[0] || null;

      return {
        salesId: q.salesId,
        salesName: q.sales?.fullName || q.salesId,
        quotationId: q.id,
        quotationNo: q.quoNo,
        qtDate: q.createdAt,
        customerName: q.customerName || '-',
        qtAmount,
        poNo: firstPo?.workOrderNo || null,
        poRefName: firstPo?.poName || null,
        poWorkOrderId: firstPo?.workOrderId || null,
        poAmount,
        recognizedAmount,
        source,
        statusKey,
      };
    });

    const filteredRows = statusFilter === 'all'
      ? mappedRows
      : mappedRows.filter(r => r.statusKey === statusFilter);

    const totalQtCount = filteredRows.length;
    const totalRecognizedAmount = filteredRows.reduce((sum, r) => sum + Number(r.recognizedAmount || 0), 0);
    const qtHasPoCount = filteredRows.filter(r => r.statusKey === 'has_po').length;
    const conversionRate = totalQtCount > 0 ? (qtHasPoCount / totalQtCount) * 100 : 0;

    const groupMap = {};
    for (const row of filteredRows) {
      if (!groupMap[row.salesId]) {
        groupMap[row.salesId] = {
          salesId: row.salesId,
          salesName: row.salesName,
          quotationCount: 0,
          poCount: 0,
          recognizedAmount: 0,
        };
      }
      groupMap[row.salesId].quotationCount += 1;
      if (row.statusKey === 'has_po') groupMap[row.salesId].poCount += 1;
      groupMap[row.salesId].recognizedAmount += Number(row.recognizedAmount || 0);
    }
    const groupedBySales = Object.values(groupMap)
      .map(g => ({
        ...g,
        conversionRate: g.quotationCount > 0 ? (g.poCount / g.quotationCount) * 100 : 0,
      }))
      .sort((a, b) => b.recognizedAmount - a.recognizedAmount);

    const topSales = groupedBySales.slice(0, 5);
    const customerOptions = Array.from(new Set(filteredRows.map(r => r.customerName).filter(Boolean))).sort((a, b) => a.localeCompare(b));

    const total = filteredRows.length;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const rows = filteredRows.slice(start, start + limit);

    res.json({
      dateRange: { from: dateFrom, to: dateTo },
      summary: {
        totalRecognizedAmount,
        totalQtCount,
        conversionRate,
        topSales,
      },
      groupedBySales,
      customers: customerOptions,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
      },
      rows,
    });
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
    const canSeeAllReports = await canViewAllReports(req.user.role);

    // Default to current month if no date range specified
    const rawFrom = req.query.from;
    const rawTo   = req.query.to;
    const dateFrom = rawFrom ? new Date(rawFrom) : new Date(now.getFullYear(), now.getMonth(), 1);
    const dateTo   = rawTo   ? new Date(rawTo + 'T23:59:59.999Z') : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const where = {
      active: true,
      createdAt: { gte: dateFrom, lte: dateTo },
    };

    if (!canSeeAllReports) {
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
    const canSeeAllReports = await canViewAllReports(req.user.role);
    const salesIds = parseSalesIds(req.query.salesIds);
    const createdAt = normalizeDateRange(req.query.from, req.query.to);
    const where = {
      active: true,
      status: { not: 'cancelled' },
      attachments: { none: poAttachmentFilter() },
      ...(createdAt ? { createdAt } : {}),
    };

    if (!canSeeAllReports) {
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
    const canSeeAllReports = await canViewAllReports(req.user.role);
    const salesIds = parseSalesIds(req.query.salesIds);
    const createdAt = normalizeDateRange(req.query.from, req.query.to);
    const customer = String(req.query.customer || '').trim();
    const poStatus = String(req.query.poStatus || 'all');

    const where = {
      active: true,
      status: { not: 'cancelled' },
      ...(createdAt ? { createdAt } : {}),
      ...(customer ? { customerName: { contains: customer, mode: 'insensitive' } } : {}),
      ...(poStatus === 'has_po' ? { attachments: { some: poAttachmentFilter() } } : {}),
      ...(poStatus === 'no_po' ? { attachments: { none: poAttachmentFilter() } } : {}),
    };

    if (!canSeeAllReports) {
      where.salesId = req.user.id;
    } else if (salesIds.length > 0) {
      where.salesId = { in: salesIds };
    }

    const workOrders = await prisma.workOrder.findMany({
      where,
      include: {
        sales: { select: { id: true, fullName: true } },
        quotation: { select: { grandTotal: true } },
        attachments: {
          where: poAttachmentFilter(),
          select: { uploadedAt: true },
          orderBy: { uploadedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = workOrders.map(wo => {
      const hasPo = wo.attachments.length > 0;
      const latestPoUploadDate = wo.attachments[0]?.uploadedAt || null;
      return {
        id: wo.id,
        woNo: wo.woNo,
        date: wo.createdAt,
        salesId: wo.salesId,
        salesName: wo.sales?.fullName || wo.salesId,
        customerName: wo.customerName,
        amount: Number(wo.quotation?.grandTotal || 0),
        hasPo,
        poStatus: hasPo ? 'มี PO แล้ว' : 'ยังไม่มี PO',
        poAttachedDate: wo.poAttachedDate || latestPoUploadDate,
        ageDays: calcAgeDays(wo.createdAt),
        status: wo.status,
      };
    });

    res.json({ rows });
  } catch (e) { next(e); }
});

// GET /api/reports/work-status
// Query:
// - from=YYYY-MM-DD (default: last 30 days)
// - to=YYYY-MM-DD   (default: today)
// - salesId=single sales id (legacy support)
// - salesIds=comma-separated sales ids
// - customer=optional text
// - poStatus=all|has|pending
// - agingRange=all|0-7|8-15|16-30|30+
// - page=number (default 1)
// - limit=number (default 50, max 500)
router.get('/work-status', authenticate, async (req, res, next) => {
  try {
    const canSeeAllReports = await canViewAllReports(req.user.role);
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const rawFrom = req.query.from;
    const rawTo = req.query.to;
    const dateFrom = rawFrom ? new Date(String(rawFrom)) : new Date(defaultFrom.getFullYear(), defaultFrom.getMonth(), defaultFrom.getDate(), 0, 0, 0, 0);
    const dateTo = rawTo ? new Date(`${rawTo}T23:59:59.999Z`) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const salesIds = parseSalesIds(req.query.salesIds);
    const singleSalesId = String(req.query.salesId || '').trim();
    if (singleSalesId && !salesIds.includes(singleSalesId)) salesIds.push(singleSalesId);

    const customer = String(req.query.customer || '').trim();
    const poStatus = String(req.query.poStatus || 'all').trim().toLowerCase();
    const agingRange = String(req.query.agingRange || 'all').trim().toLowerCase();
    const page = parsePageInt(req.query.page, 1, { min: 1, max: 100000 });
    const limit = parsePageInt(req.query.limit, 50, { min: 1, max: 500 });

    const where = {
      active: true,
      createdAt: { gte: dateFrom, lte: dateTo },
      ...(customer ? { customerName: { contains: customer, mode: 'insensitive' } } : {}),
    };

    if (!canSeeAllReports) {
      where.salesId = req.user.id;
    } else if (salesIds.length > 0) {
      where.salesId = { in: salesIds };
    }

    const workOrders = await prisma.workOrder.findMany({
      where,
      select: {
        id: true,
        woNo: true,
        project: true,
        createdAt: true,
        status: true,
        customerName: true,
        salesId: true,
        sales: { select: { id: true, fullName: true } },
        quotation: { select: { id: true, quoNo: true, grandTotal: true } },
        attachments: {
          where: poAttachmentFilter(),
          select: {
            id: true,
            originalName: true,
            poAmount: true,
            uploadedAt: true,
          },
          orderBy: { uploadedAt: 'desc' },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { woNo: 'desc' }],
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const mapAgingRange = (days) => {
      if (!Number.isFinite(days) || days < 0) return null;
      if (days <= 7) return '0-7';
      if (days <= 15) return '8-15';
      if (days <= 30) return '16-30';
      return '30+';
    };

    const mappedRows = workOrders
      .filter(wo => wo.status !== 'cancelled')
      .map((wo) => {
        const poFiles = wo.attachments || [];
        const poAmount = poFiles.reduce((sum, po) => sum + Number(po.poAmount || 0), 0);
        const hasPo = poFiles.length > 0;
        const qtAmount = Number(wo.quotation?.grandTotal || 0);

        let poStatusLabel = 'Pending';
        if (hasPo && qtAmount > 0 && poAmount < qtAmount) poStatusLabel = 'Partial';
        else if (hasPo) poStatusLabel = 'Received';

        const poStatusKey = hasPo ? 'has' : 'pending';

        const firstPo = poFiles[0] || null;
        const workDate = new Date(wo.createdAt);
        workDate.setHours(0, 0, 0, 0);
        const agingDaysRaw = Math.max(0, Math.floor((today.getTime() - workDate.getTime()) / 86400000));
        const agingDays = hasPo ? 0 : agingDaysRaw;

        return {
          id: wo.id,
          workNo: wo.woNo,
          workDate: wo.createdAt,
          customerName: wo.customerName || '-',
          salesId: wo.salesId,
          salesName: wo.sales?.fullName || wo.salesId,
          project: wo.project || '-',
          quotationId: wo.quotation?.id || null,
          quotationNo: wo.quotation?.quoNo || '-',
          qtAmount,
          poNo: firstPo?.originalName || null,
          poAmount,
          poStatus: poStatusLabel,
          poStatusKey,
          agingDays,
          agingRange: mapAgingRange(agingDays),
          expectedPoDate: null,
        };
      });

    let filteredRows = mappedRows;
    if (poStatus === 'has') {
      filteredRows = filteredRows.filter(r => r.poStatusKey === 'has');
    } else if (poStatus === 'pending') {
      filteredRows = filteredRows.filter(r => r.poStatusKey === 'pending');
    }

    if (agingRange !== 'all') {
      filteredRows = filteredRows.filter(r => {
        if (r.poStatusKey !== 'pending') return false;
        return r.agingRange === agingRange;
      });
    }

    const totalWorks = filteredRows.length;
    const worksWithPo = filteredRows.filter(r => r.poStatusKey === 'has').length;
    const worksPendingPo = filteredRows.filter(r => r.poStatusKey === 'pending').length;
    const withPoPct = totalWorks > 0 ? (worksWithPo / totalWorks) * 100 : 0;
    const pendingPoPct = totalWorks > 0 ? (worksPendingPo / totalWorks) * 100 : 0;
    const totalQtAmountAtRisk = filteredRows
      .filter(r => r.poStatusKey === 'pending')
      .reduce((sum, r) => sum + Number(r.qtAmount || 0), 0);
    const pendingAgingList = filteredRows.filter(r => r.poStatusKey === 'pending').map(r => Number(r.agingDays || 0));
    const averagePendingAging = pendingAgingList.length > 0
      ? pendingAgingList.reduce((sum, n) => sum + n, 0) / pendingAgingList.length
      : 0;

    const pendingBySalesMap = {};
    for (const row of filteredRows) {
      if (row.poStatusKey !== 'pending') continue;
      if (!pendingBySalesMap[row.salesId]) {
        pendingBySalesMap[row.salesId] = { salesId: row.salesId, salesName: row.salesName, count: 0 };
      }
      pendingBySalesMap[row.salesId].count += 1;
    }

    const pendingBySales = Object.values(pendingBySalesMap).sort((a, b) => b.count - a.count);
    const poSplit = [
      { key: 'has', label: 'Has PO', value: worksWithPo },
      { key: 'pending', label: 'Pending PO', value: worksPendingPo },
    ];

    const total = filteredRows.length;
    const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const rows = filteredRows.slice(start, start + limit);

    res.json({
      dateRange: { from: dateFrom, to: dateTo },
      summary: {
        totalWorks,
        worksWithPo,
        worksWithPoPct: withPoPct,
        worksPendingPo,
        worksPendingPoPct: pendingPoPct,
        totalQtAmountAtRisk,
        averagePendingAging,
      },
      charts: {
        pendingBySales,
        poSplit,
      },
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
      },
      rows,
    });
  } catch (e) { next(e); }
});

module.exports = router;
