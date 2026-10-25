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

### PR Type viewers

In **PR Types**, create or edit a type and select individual users under
**ผู้มีสิทธิ์ดู PR (รายบุคคล)**. Selected users can list, open and print all PRs
of that type across approval stages and statuses, including existing documents.
They also see the Purchase Request menu regardless of their role's PR menu setting.
This grants read access only; existing approval, edit, attachment and other action
permissions remain unchanged. Removing a user revokes this extra access immediately
on subsequent API requests; owner/approver permissions still apply. Deactivating a
type does not revoke access to its existing documents.

Before deploying this feature, apply
[pr-type-viewers.sql](api/scripts/sql/pr-type-viewers.sql) through the normal
database deployment process, run `npm run db:generate` from `api`, and restart the
API. The additive, re-runnable SQL defaults existing types to no extra viewers.
No database schema changes are applied automatically by the application.

### Accounting customer and supplier pages

In Accounting, open Master Data and select Customers or Suppliers. Add, View,
and Edit open full-page forms rather than dialogs. Use Back to List to return
to the same master-data tab after viewing or saving.

- Customers: `/master/customers/new`, `/master/customers/<id>`, `/master/customers/<id>/edit`
- Suppliers: `/master/suppliers/new`, `/master/suppliers/<id>`, `/master/suppliers/<id>/edit`

These pages use the existing Accounting master-data permissions and APIs.

### Supplier CSV Import

Run from `api` in PowerShell. The default is an **offline dry-run**: no database
connection, schema changes, or inserts. It accepts the 20-column Supplier report,
including group headers and summary rows.

```powershell
npm run db:import:suppliers:dry
# Optional JSON report (new file only; contains supplier/contact data).
npm run db:import:suppliers:dry -- --report="D:\reports\supplier-preview.json"
# Optional read-only database code collision check; never inserts or updates.
npm run db:import:suppliers:dry -- --check-db
```

Import preserves original string codes (including leading zeros), names, addresses,
contacts, phones, fax, group code/name, and credit limits. `None` is preserved as a
literal group code with a null group name. Groups `002` and `003` keep their leading
zeros. Equal names with different codes remain separate suppliers. Empty credit
limits stay null, not zero; monetary limits are never used as payment days.

The CSV has no explicit branch, VAT, payment days, or supplier type. The preview
reports the existing system defaults: head office, `VAT7%`, 30 days, `domestic`,
and active. **Review these assumptions before applying**, especially for individuals
and branch suppliers. Tax IDs, email and bank details are not inferred.

Only after approval, back up the database and apply
[supplier-import-support.sql](api/scripts/sql/supplier-import-support.sql) using
the normal database deployment process. This additive, re-runnable SQL adds `fax`,
`group_code`, `group_name`, and `credit_limit DECIMAL(14,2)` without changing existing
rows. Regenerate the client, then explicitly confirm the import:

```powershell
npm run db:generate
npm run db:import:suppliers:apply -- --confirm=IMPORT_SUPPLIERS
```

The apply command does not deploy schema changes automatically. It checks schema
and client compatibility, then inserts in one serializable transaction with audit
logs. Existing codes, including inactive suppliers, are skipped without updates.
Any insert, concurrent conflict, or audit error aborts the transaction; review and
rerun rather than overwriting existing suppliers. Use `--file=...` for a different
input and `--performed-by=...` to attribute imports to an operator.

Supplier GET endpoints return the new stored fields. The current master-data form
does not provide editors for them; this import does not add a CSV-upload UI.

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
