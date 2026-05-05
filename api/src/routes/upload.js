const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../lib/prisma');
const { authenticate } = require('../middleware/auth');
const { isR2Enabled, uploadToR2, deleteFromR2 } = require('../lib/r2');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ถ้ามี R2 ให้ใช้ memory storage, ถ้าไม่มีใช้ disk
const storage = isR2Enabled
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
      filename: (_req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
      },
    });

const upload = multer({
  storage,
  limits: { fileSize: (Number(process.env.MAX_FILE_SIZE_MB) || 10) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|zip|rar/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) return cb(null, true);
    cb(new Error('File type not allowed'));
  },
});

// POST /api/upload
router.post('/', authenticate, upload.array('files', 10), async (req, res, next) => {
  try {
    const { category, quotationId, workOrderId, handOverJobId, purchaseRequestId } = req.body;
    const saved = [];
    for (const file of req.files || []) {
      let filename, fileUrl;

      if (isR2Enabled) {
        // อัพโหลดไป R2
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const key = unique + path.extname(file.originalname);
        fileUrl = await uploadToR2(key, file.buffer, file.mimetype);
        filename = key;
      } else {
        // เก็บบน disk (fallback)
        filename = file.filename;
        fileUrl = `/uploads/${file.filename}`;
      }

      const attachment = await prisma.attachment.create({
        data: {
          filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          fileUrl,
          category: category || null,
          quotationId: quotationId || null,
          workOrderId: workOrderId || null,
          handOverJobId: handOverJobId || null,
          purchaseRequestId: purchaseRequestId || null,
        },
      });
      saved.push(attachment);
    }
    res.status(201).json(saved);
  } catch (e) { next(e); }
});

// DELETE /api/upload/:id
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const att = await prisma.attachment.findUniqueOrThrow({ where: { id: req.params.id } });
    if (isR2Enabled) {
      await deleteFromR2(att.filename).catch(() => {}); // ไม่ block ถ้า R2 fail
    } else {
      const filePath = path.join(UPLOAD_DIR, att.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await prisma.attachment.delete({ where: { id: req.params.id } });
    res.json({ message: 'File deleted' });
  } catch (e) { next(e); }
});

module.exports = router;
