const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { GL_ROLES, glInput, glView, saveGl } = require('../lib/accountingGl');

router.use(authenticate, requireRole('admin'));
router.get('/', async (_req, res, next) => {
  try {
    const [config, accounts] = await Promise.all([
      prisma.accountingGlConfiguration.findUnique({ where: { id: 'main' } }),
      prisma.chartOfAccount.findMany({ where: { active: true, accountType: 'detail' }, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' } }),
    ]);
    res.json({ config: glView(config), roles: GL_ROLES, accounts });
  } catch (error) { next(error); }
});
router.put('/', async (req, res, next) => {
  try {
    const input = glInput(req.body);
    res.json(await prisma.$transaction(tx => saveGl(tx, input, req)));
  } catch (error) { next(error); }
});

module.exports = router;
