const router = require('express').Router();
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { getPagination, paginated } = require('../lib/pagination');

// GET /api/suppliers
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { active, q, supplierType } = req.query;
    const where = {};
    if (active !== undefined) where.active = active === 'true';
    if (supplierType) where.supplierType = supplierType;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { taxId: { contains: q, mode: 'insensitive' } },
      ];
    }
    const pg = getPagination(req.query);
    if (pg) {
      const [data, total] = await prisma.$transaction([
        prisma.supplier.findMany({ where, orderBy: { code: 'asc' }, skip: pg.skip, take: pg.take }),
        prisma.supplier.count({ where }),
      ]);
      return res.json(paginated(data, total, pg));
    }
    const list = await prisma.supplier.findMany({ where, orderBy: { code: 'asc' } });
    res.json(list);
  } catch (e) {
    next(e);
  }
});

// GET /api/suppliers/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const item = await prisma.supplier.findUniqueOrThrow({ where: { id: req.params.id } });
    res.json(item);
  } catch (e) {
    next(e);
  }
});

// POST /api/suppliers
router.post('/', authenticate, async (req, res, next) => {
  try {
    const {
      code,
      name,
      taxId,
      branch = 'สำนักงานใหญ่',
      address,
      billingAddress,
      contactPerson,
      tel,
      email,
      vatConfig = 'VAT7%',
      paymentTerm = 30,
      supplierType = 'domestic',
      bankName,
      bankBranch,
      bankAccountNo,
      bankAccountName,
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({ message: 'โปรดระบุ รหัสผู้จำหน่าย (code) และ ชื่อผู้จำหน่าย (name)' });
    }

    const item = await prisma.supplier.create({
      data: {
        code: String(code).trim(),
        name: String(name).trim(),
        taxId,
        branch,
        address,
        billingAddress,
        contactPerson,
        tel,
        email,
        vatConfig,
        paymentTerm: parseInt(paymentTerm, 10) || 30,
        supplierType,
        bankName,
        bankBranch,
        bankAccountNo,
        bankAccountName,
      },
    });

    res.status(201).json(item);
  } catch (e) {
    next(e);
  }
});

// PUT /api/suppliers/:id
router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const {
      code,
      name,
      taxId,
      branch,
      address,
      billingAddress,
      contactPerson,
      tel,
      email,
      vatConfig,
      paymentTerm,
      supplierType,
      bankName,
      bankBranch,
      bankAccountNo,
      bankAccountName,
      active,
    } = req.body;

    const item = await prisma.supplier.update({
      where: { id: req.params.id },
      data: {
        code,
        name,
        taxId,
        branch,
        address,
        billingAddress,
        contactPerson,
        tel,
        email,
        vatConfig,
        paymentTerm: paymentTerm != null ? parseInt(paymentTerm, 10) : undefined,
        supplierType,
        bankName,
        bankBranch,
        bankAccountNo,
        bankAccountName,
        active,
      },
    });

    res.json(item);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/suppliers/:id (soft delete)
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await prisma.supplier.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ message: 'Supplier deactivated' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
