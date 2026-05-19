const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { notifyUser } = require('../lib/notify');

const ADMIN_ROLES = ['admin', 'director', 'admin_mgr'];

// GET /api/settings  (all authenticated users — needed for company info on docs)
router.get('/', authenticate, async (_req, res, next) => {
  try {
    let settings = await prisma.settings.findUnique({ where: { id: 'main' } });
    if (!settings) {
      settings = await prisma.settings.create({ data: { id: 'main' } });
    }
    res.json(settings);
  } catch (e) { next(e); }
});

// PUT /api/settings  (admin/director only)
router.put('/', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const {
      companyName, companyNameEn, address, taxId, tel, email, website, logoUrl,
      approvalFlowConfig, menuAccessConfig, rolePermissionsConfig, stepRoleConfig,
    } = req.body;
    const data = {};
    if (companyName             !== undefined) data.companyName             = companyName;
    if (companyNameEn           !== undefined) data.companyNameEn           = companyNameEn;
    if (address                 !== undefined) data.address                 = address;
    if (taxId                   !== undefined) data.taxId                   = taxId;
    if (tel                     !== undefined) data.tel                     = tel;
    if (email                   !== undefined) data.email                   = email;
    if (website                 !== undefined) data.website                 = website;
    if (logoUrl                 !== undefined) data.logoUrl                 = logoUrl;
    if (approvalFlowConfig      !== undefined) data.approvalFlowConfig      = approvalFlowConfig;
    if (menuAccessConfig        !== undefined) data.menuAccessConfig        = menuAccessConfig;
    if (rolePermissionsConfig   !== undefined) data.rolePermissionsConfig   = rolePermissionsConfig;
    if (stepRoleConfig          !== undefined) data.stepRoleConfig          = stepRoleConfig;

    const settings = await prisma.settings.upsert({
      where: { id: 'main' },
      update: data,
      create: { id: 'main', ...data },
    });
    res.json(settings);
  } catch (e) { next(e); }
});

// POST /api/settings/test-notify  (admin only — ทดสอบส่ง Email + LINE)
router.post('/test-notify', authenticate, requireRole(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true, lineUserId: true },
    });

    const msg = `🔔 ทดสอบระบบแจ้งเตือน GreenDii\n\nส่งถึง: ${user.fullName}\nวันที่: ${new Date().toLocaleString('th-TH')}\n\nระบบทำงานปกติครับ ✅`;

    await notifyUser(userId, msg);

    res.json({
      ok: true,
      sentTo: user.fullName,
      email: user.email || null,
      lineUserId: user.lineUserId || null,
    });
  } catch (e) { next(e); }
});

module.exports = router;
