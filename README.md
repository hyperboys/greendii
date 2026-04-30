# GreenDii — Sales Workflow System

ระบบ Sales Workflow สำหรับ GreenDii  
**Quotation → Work Order → Hand Over Job → Purchase Request**

---

## Project Structure

```
Greendii/
├── api/                    # Backend (Node.js + Express + Prisma)
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.js         # Seed data
│   ├── src/
│   │   ├── index.js        # Express app entry
│   │   ├── lib/prisma.js   # Prisma client singleton
│   │   ├── middleware/
│   │   │   ├── auth.js     # JWT authentication
│   │   │   └── errorHandler.js
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── users.js
│   │       ├── customers.js
│   │       ├── products.js
│   │       ├── units.js
│   │       ├── quotations.js
│   │       ├── workorders.js
│   │       ├── handovers.js
│   │       ├── pr.js
│   │       ├── approvals.js
│   │       ├── reports.js
│   │       └── upload.js
│   ├── package.json
│   └── .env.example
│
├── ui/                     # Frontend
│   ├── app.html            # Main SPA (converted from demo.html)
│   ├── index.html          # Landing/overview page
│   └── js/
│       └── api-client.js   # window.GD — replaces localStorage
│
├── doc/
│   └── swagger.yaml        # OpenAPI 3.0 spec
│
└── Doc/                    # Original design documents
    └── function-summary.html
```

---

## Quick Start

### 1. Database Setup

```bash
# Install PostgreSQL 15 (if not installed)
# Create database
psql -U postgres -c "CREATE USER greendii_app WITH PASSWORD 'your_password';"
psql -U postgres -c "CREATE DATABASE greendii_production OWNER greendii_app;"
```

### 2. API Setup

```bash
cd api

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env — set DATABASE_URL and JWT_SECRET

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed initial data
npm run db:seed

# Start development server
npm run dev
```

API will be available at: `http://localhost:4000`  
Swagger UI at: `http://localhost:4000/docs`

### 3. UI Setup

The UI is plain HTML/JS — no build step required.

```bash
# Option A: VS Code Live Server (recommended for dev)
# Right-click ui/app.html → Open with Live Server

# Option B: Python simple server
cd ui
python -m http.server 3000

# Option C: Nginx/Apache for production
```

Set the API base URL in `ui/app.html`:
```html
<script>
  window.API_BASE = 'http://localhost:4000/api'; // or your production URL
</script>
<script src="js/api-client.js"></script>
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login → returns JWT token |
| GET  | `/api/auth/me` | Get current user |
| GET  | `/api/users` | List users |
| POST | `/api/users` | Create user (admin only) |
| GET  | `/api/customers` | List customers |
| POST | `/api/customers` | Create customer |
| GET  | `/api/products` | List products |
| POST | `/api/products` | Create product |
| GET  | `/api/units` | List units |
| GET  | `/api/quotations` | List quotations |
| POST | `/api/quotations` | Create quotation |
| POST | `/api/quotations/:id/submit` | Submit for approval |
| POST | `/api/quotations/:id/approve` | Approve |
| POST | `/api/quotations/:id/reject` | Reject |
| GET  | `/api/workorders` | List work orders |
| POST | `/api/workorders` | Create work order |
| GET  | `/api/handovers` | List hand over jobs |
| POST | `/api/handovers` | Create hand over job |
| GET  | `/api/pr` | List purchase requests |
| POST | `/api/pr` | Create purchase request |
| GET  | `/api/approvals/pending` | My pending items |
| GET  | `/api/reports/overview` | Dashboard stats |
| GET  | `/api/reports/sales` | Sales by customer |
| POST | `/api/upload` | Upload files |

Full documentation: **http://localhost:4000/docs** (Swagger UI)

---

## User Roles & Approval Flow

| Step | Role | Label |
|------|------|-------|
| 1 | `sales` | เซลล์คนที่ 1 |
| 2 | `sales2` | เซลล์คนที่ 2 |
| 3 | `sale_mgr` | Sales Manager |
| 4 | `admin_mgr` | Admin Manager |
| 5 | `project_mgr` | Project Manager |
| 6 | `director` | Managing Director |
| 7 | `procurement` | Procurement |
| 8 | `factory` | ทีมโรงงาน (Work Order only) |

---

## Default Users (after seed)

| Username | Password | Role |
|----------|----------|------|
| somchai | 1234 | sales |
| somsri | 1234 | sales2 |
| manager_sale | 1234 | sale_mgr |
| manager_admin | 1234 | admin_mgr |
| manager_project | 1234 | project_mgr |
| director | 1234 | director |
| procurement | 1234 | procurement |
| factory | 1234 | factory |

---

## Environment Variables

```env
DATABASE_URL="postgresql://greendii_app:PASSWORD@localhost:5432/greendii_production"
JWT_SECRET="long-random-secret-here"
JWT_EXPIRES_IN="8h"
PORT=4000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
```

---

## Production Deployment

See `DATABASE-SERVER-GUIDE.md` for server setup and PostgreSQL configuration.

Recommended stack:
- **App Server**: Vultr/Hetzner VPS + PM2 + Nginx
- **DB Server**: Separate PostgreSQL 15 server
- **Process Manager**: `pm2 start src/index.js --name greendii-api`
