const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');

const ADMIN_ROLES = ['admin', 'director', 'admin_mgr'];

async function validateViewerIds(viewerIds) {
  if (!Array.isArray(viewerIds) || viewerIds.some(id => typeof id !== 'string' || !id.trim())) {
    const error = new Error('viewerIds ต้องเป็นรายการรหัสผู้ใช้');
    error.status = 400;
    throw error;
  }
  const ids = [...new Set(viewerIds)];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (users.length !== ids.length) {
    const error = new Error('ไม่พบผู้ใช้ที่เลือกบางรายการ');
    error.status = 400;
    throw error;
  }
  return ids;
}

function normalizeStageEntry(entry) {
  if (Array.isArray(entry)) {
    const stage = entry
      .map(s => Number(s))
      .filter(n => Number.isInteger(n) && n > 0);
    if (stage.length === 0) return null;
    const deduped = [...new Set(stage)];
    return deduped.length === 1 ? deduped[0] : deduped;
  }

  const step = Number(entry);
  if (!Number.isInteger(step) || step <= 0) return null;
  return step;
}

// Normalize approvalSteps payload:
// - Legacy: [3,4,5]
// - OR stage: [[3,4],5,[6,7]]
function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps
    .map(normalizeStageEntry)
    .filter(Boolean);
}

// GET /api/pr-types  — all authenticated users (needed when creating a PR)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { active } = req.query;
    const where = {};
    if (active !== undefined) where.active = active === 'true';
    const list = await prisma.prType.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(list);
  } catch (e) { next(e); }
});

// POST /api/pr-types  (admin only)
router.post('/', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, approvalSteps, sortOrder, viewerIds = [] } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'name required' });
    const validatedViewerIds = await validateViewerIds(viewerIds);
    const item = await prisma.prType.create({
      data: {
        name: name.trim(),
        approvalSteps: normalizeSteps(approvalSteps),
        viewerIds: validatedViewerIds,
        sortOrder: Number.isInteger(sortOrder) ? sortOrder : 0,
      },
    });
    res.status(201).json(item);
  } catch (e) { next(e); }
});

// PUT /api/pr-types/:id  (admin only)
router.put('/:id', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const { name, approvalSteps, active, sortOrder, viewerIds } = req.body;
    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (approvalSteps !== undefined) data.approvalSteps = normalizeSteps(approvalSteps);
    if (viewerIds !== undefined) data.viewerIds = await validateViewerIds(viewerIds);
    if (active !== undefined) data.active = !!active;
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;
    const item = await prisma.prType.update({ where: { id: req.params.id }, data });
    res.json(item);
  } catch (e) { next(e); }
});

// DELETE /api/pr-types/:id  (admin only — soft delete)
router.delete('/:id', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    await prisma.prType.update({ where: { id: req.params.id }, data: { active: false } });
    res.json({ message: 'PR type deactivated' });
  } catch (e) { next(e); }
});

module.exports = router;
