require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const morgan = require('morgan');
const rfs = require('rotating-file-stream');
const prisma = require('./lib/prisma');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const customersRoutes = require('./routes/customers');
const productsRoutes = require('./routes/products');
const unitsRoutes = require('./routes/units');
const prTypesRoutes = require('./routes/prTypes');
const quotationsRoutes = require('./routes/quotations');
const workordersRoutes = require('./routes/workorders');
const workorderEmailsRoutes = require('./routes/workorder-emails');
const handoversRoutes = require('./routes/handovers');
const prRoutes = require('./routes/pr');
const approvalsRoutes = require('./routes/approvals');
const reportsRoutes = require('./routes/reports');
const uploadRoutes = require('./routes/upload');
const settingsRoutes = require('./routes/settings');
const notificationsRoutes = require('./routes/notifications');
const auditRoutes         = require('./routes/audit');
const activityLogsRoutes  = require('./routes/activity-logs');
const lineRoutes          = require('./routes/line');
const { errorHandler } = require('./middleware/errorHandler');
const { activityLogger } = require('./middleware/activityLogger');

const app = express();

// Trust the first proxy (Nginx) so rate-limit/secure cookies see the real client IP.
app.set('trust proxy', 1);

// ─── SECURITY HEADERS ───────────────────────────────────────────────────────
// crossOriginResourcePolicy is relaxed so /uploads can be embedded by the UI.
// Keep frameguard on for normal routes; we remove X-Frame-Options only for
// static uploads so PDF attachments can render inside the UI preview iframe.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Swagger UI needs inline scripts/styles
}));

// ─── CORS ───────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',').map(s => s.trim());

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ─── BODY PARSER ────────────────────────────────────────────────────────────
// Save raw body buffer for LINE webhook signature verification
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true }));

// Correlation id for tracing one request across UI/API/logs.
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// ─── HTTP ACCESS LOGGING (Morgan) ───────────────────────────────────────────
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// Rotating file: one file per day, keep 30 days
const accessLogStream = rfs.createStream('access.log', {
  interval: '1d',
  maxFiles: 30,
  path: logsDir,
});
app.use(morgan('combined', { stream: accessLogStream }));
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev')); // coloured console log in dev
}

// ─── ACTIVITY LOGGER (DB) ───────────────────────────────────────────────────
app.use(activityLogger);

// ─── STATIC UPLOADS ─────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  setHeaders: (res, filePath) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (path.extname(filePath).toLowerCase() === '.pdf') {
      res.setHeader('Content-Disposition', 'inline');
    }
  },
}));

// ─── SWAGGER DOCS ───────────────────────────────────────────────────────────
try {
  const swaggerCandidates = [
    path.join(__dirname, '../../Doc/swagger.yaml'),
    path.join(__dirname, '../../doc/swagger.yaml'),
  ];
  const swaggerPath = swaggerCandidates.find(p => fs.existsSync(p));

  if (!swaggerPath) {
    throw new Error('swagger.yaml not found');
  }

  const swaggerDoc = YAML.load(swaggerPath);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customSiteTitle: 'GreenDii API Docs',
  }));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customSiteTitle: 'GreenDii API Docs',
  }));
  console.log('📚 Swagger UI → http://localhost:' + (process.env.PORT || 4000) + '/docs');
} catch (e) {
  console.warn('⚠️  swagger.yaml not found, skipping Swagger UI');
}

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', ts: new Date() });
  } catch {
    res.status(503).json({ status: 'error', db: 'down', ts: new Date() });
  }
});

// ─── ROUTES ─────────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                  // limit each IP to 10 login attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณาลองใหม่ภายหลัง' },
});
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'ขอรหัสผ่านชั่วคราวบ่อยเกินไป กรุณาลองใหม่ภายหลัง' },
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/pr-types', prTypesRoutes);
app.use('/api/quotations', quotationsRoutes);
app.use('/api/workorders', workordersRoutes);
app.use('/api/workorder-emails', workorderEmailsRoutes);
app.use('/api/handovers', handoversRoutes);
app.use('/api/pr', prRoutes);
app.use('/api/approvals', approvalsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/line',          lineRoutes);
app.use('/api/audit',         auditRoutes);
app.use('/api/activity-logs', activityLogsRoutes);

// ─── 404 ────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

// ─── ERROR HANDLER ──────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── START ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, () => {
  console.log(`🚀 GreenDii API running → http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);
});

// ─── GRACEFUL SHUTDOWN ──────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down gracefully…`);
  server.close(async () => {
    await prisma.$disconnect().catch(() => {});
    process.exit(0);
  });
  // Force-exit if connections do not close in time
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
