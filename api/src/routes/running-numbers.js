const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate, requireRole } = require('../middleware/auth');
const { generateNextRunningNumber, DOC_PATTERNS } = require('../lib/runningNumber');

// GET /api/running-numbers/next?docType=so
router.get('/next', authenticate, async (req, res, next) => {
  try {
    const { docType } = req.query;
    if (!docType) {
      return res.status(400).json({ message: 'ระบุ docType (เช่น so, iv, bi, cn, rv, po, ps, gr, pv, cq)' });
    }
    const nextNumber = await generateNextRunningNumber(docType);
    res.json({ docType, nextNumber });
  } catch (err) {
    next(err);
  }
});

// GET /api/running-numbers/sequences — list active sequences (admin only)
router.get('/sequences', authenticate, requireRole('admin', 'director'), async (_req, res, next) => {
  try {
    const sequences = await prisma.documentSequence.findMany({
      orderBy: [{ docType: 'asc' }, { periodKey: 'desc' }],
    });
    res.json({ sequences, supportedPatterns: Object.keys(DOC_PATTERNS) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
