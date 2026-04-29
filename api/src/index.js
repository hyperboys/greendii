require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');

const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const customersRoutes = require('./routes/customers');
const productsRoutes = require('./routes/products');
const unitsRoutes = require('./routes/units');
const quotationsRoutes = require('./routes/quotations');
const workordersRoutes = require('./routes/workorders');
const handoversRoutes = require('./routes/handovers');
const prRoutes = require('./routes/pr');
const approvalsRoutes = require('./routes/approvals');
const reportsRoutes = require('./routes/reports');
const uploadRoutes = require('./routes/upload');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── STATIC UPLOADS ─────────────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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
    customSiteTitle: 'Green Dii API Docs',
  }));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customSiteTitle: 'Green Dii API Docs',
  }));
  console.log('📚 Swagger UI → http://localhost:' + (process.env.PORT || 4000) + '/docs');
} catch (e) {
  console.warn('⚠️  swagger.yaml not found, skipping Swagger UI');
}

// ─── HEALTH CHECK ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ─── ROUTES ─────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/units', unitsRoutes);
app.use('/api/quotations', quotationsRoutes);
app.use('/api/workorders', workordersRoutes);
app.use('/api/handovers', handoversRoutes);
app.use('/api/pr', prRoutes);
app.use('/api/approvals', approvalsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/upload', uploadRoutes);

// ─── 404 ────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

// ─── ERROR HANDLER ──────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── START ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Green Dii API running → http://localhost:${PORT}`);
  console.log(`   ENV: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
