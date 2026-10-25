# GreenDii Accounting UI

Separate Next.js frontend for Accounting. It uses the existing GreenDii API, database, users, and authentication tokens.

## Frontend stack

The shared toolchain versions match the existing `ui/package-lock.json`:

| Package | Version |
| --- | --- |
| Next.js / eslint-config-next | 14.2.35 |
| React / React DOM | 18.3.1 |
| Tailwind CSS | 3.4.19 |
| TypeScript | 5.9.3 |
| Lucide React | 0.460.0 |
| ESLint | 8.57.1 |

Shared direct dependencies are pinned to the Sales UI's locked versions so
independent installs stay aligned. Accounting keeps its Fetch client and React
Context; unused Sales-only libraries are not installed.

Next.js configuration uses `next.config.mjs`. Development output is `.next-dev`,
separate from the production `.next` output, matching the Sales UI's approach.
Tailwind 3 uses `tailwind.config.ts` and the Tailwind/PostCSS/autoprefixer plugins.
The theme retains Accounting's existing dimensions and control typography.

## Navigation

The root layout owns the shared sidebar and header so they remain mounted while
switching between Accounting pages. The blue sidebar groups AR, AP, inventory,
master data and reports into collapsible parent/child menus. Mobile navigation
uses the same hierarchy in a drawer.
On desktop, the header's sidebar button collapses the menu to a 72px icon rail
and expands the content area. Icon tooltips identify each menu; selecting a parent
icon expands the sidebar and opens that group. The collapsed state survives page
navigation, and opening the mobile drawer restores the full menu.

### Mobile and tablet layouts

Below 1024px the sidebar is an off-canvas drawer; at 1024px and above the desktop
sidebar and collapse button are available. The drawer locks background scrolling,
keeps keyboard focus inside, closes with Escape and restores focus to its opener.
Rotating/resizing to desktop closes the drawer and releases the scroll lock.
Hidden mobile navigation is not keyboard-focusable.

Tables scroll horizontally inside their containers rather than widening the page.
Touch-layout buttons and form controls have a minimum 44px height; text controls
use 16px text to avoid iOS focus zoom. Creation dialogs scroll within the dynamic
viewport, including short landscape screens, so their final actions stay reachable.

Responsive validation uses browser viewport emulation with mocked API responses:
320x568, 390x844, 768x1024, 1024x768 and 1180x820 across 11 protected pages, plus
all six creation dialogs at 320x568, 844x390 and 768x1024. Physical-device Safari
and Android keyboard behavior should still be checked during device acceptance.

Former in-page tabs are now sidebar links with a `tab` query parameter, such as
`/master?tab=suppliers` and `/reports?tab=apAging`. Refresh, direct links and browser
Back/Forward preserve the selected section. URLs without a tab (or with an unknown
tab) select the first section, as before. Customer and supplier detail/edit routes
highlight their corresponding master-data menu.

## Local development

Start the shared backend first:

```powershell
npm --prefix api start
```

Start this UI from the repository root:

```powershell
npm --prefix accounting-ui run dev
```

Open http://localhost:3001. The existing Sales UI can continue running on port 3000.

## API configuration

The development default is `http://localhost:4000/api`. Set `API_URL` when the API is hosted elsewhere:

```env
API_URL=https://api.example.com/api
```

Browser requests use the local `/api/*` rewrite, so authentication remains same-origin from the Accounting UI. Session storage keys match the existing UI: `gd_token`, `gd_refresh`, and `gd_user`.

The API still validates the browser's `Origin` header forwarded by the rewrite. Include
`http://localhost:3001` in `CORS_ORIGIN` in `api/.env`, alongside the existing Sales UI
origins, and restart the API after changing it. For a deployed Accounting UI, allow
its exact origin instead. A `CORS: origin ... not allowed` error is an API origin
configuration issue, not a user role or password rejection.

## Accounting roles and access

Accounting uses separate `AccountingRole` and `AccountingUserRole` records. It does
not change `User.role`, legacy role settings, login credentials, or the Sales UI.
Each user can have one Accounting role.

- Existing users with legacy role `admin` have full Accounting access and are the
  only users who can manage Accounting roles and assignments.
- All other users start without Accounting access, including legacy directors and
  managers. Create a role and assign it explicitly.
- In Accounting, open **บทบาท & สิทธิ์ Accounting** (`/settings/access`), create a
  role with the desired permissions, then select that role beside each user.
  Select **ไม่มีสิทธิ์ Accounting** to revoke access.
- Permissions cover AR (including receipts), AP, inventory, master data, and
  reports. Only operations currently supported by the API appear. A write
  permission requires view permission in the same module. Read-only lookup
  endpoints supply dropdown options to transaction creators without granting
  master-data management access.
- Role updates and revocations take effect on the next API request, including
  existing sessions. The UI rechecks access in the background on route changes and window focus, hides
  unavailable menus, and disables create actions for viewers. Dashboard access is
  included with any assigned role; its current content is a static placeholder.
  The initial session check still blocks rendering; subsequent checks retain
  same-session access while pending to avoid replacing the entire screen.
  Each destination is checked against the current permissions immediately.
  A failed refresh or revoked permission displays the access/error screen rather
  than silently keeping stale authorization. Public/auth pages clear cached access.
- These checks protect the Accounting API routes themselves, regardless of which
  client calls them. Legacy Sales routes and their existing policies are unchanged.

Apply `api/prisma/migrations/20261020140000_accounting_roles/migration.sql` and run
`npx prisma generate` from `api/` before starting the updated backend.
On a database with a consistent migration history, use the normal Prisma migration
deployment workflow instead of applying SQL manually. Do not reset a shared
database or deploy unrelated pending migrations to install this feature. If this
SQL is applied separately, record only this migration with
`prisma migrate resolve --applied 20261020140000_accounting_roles` from `api/`.

Role-management endpoints are under `/api/accounting-access`: `/me`, `/roles`,
and `/users/:id/role`. These are separate from the legacy `/api/users` and settings
endpoints. The role-assignment endpoint accepts `{ "roleId": "..." }` or
`{ "roleId": null }` to revoke access.

## Accounting customers and Sales registry

Open **ผังบัญชี & ข้อมูลหลัก** (`/master`):

- **ลูกค้า (Customer)** supports create, detail view, edit, search, active/inactive
  filtering, contact information, VAT and credit terms (including zero days).
  Customer code and name are required; code uniqueness is enforced by the database.
  Duplicate Tax IDs produce a visible warning, not a new tax-identity uniqueness
  rule. No Tax ID format or automatic customer-code numbering is assumed.
- Each customer has multiple branches identified by a code unique within that
  customer. Each branch has multiple labelled billing, shipping, or combined
  addresses. The first branch is the default; a dedicated billing/shipping
  address takes precedence over a combined address.
- **Sale บัญชี** is an independent Accounting registry with its own code, name,
  contact information and active status. It is neither a Sales customer nor a
  login/user account. Create the registry entry before assigning it to a customer.
  Deactivated Sale entries cannot be newly assigned but remain visible on
  customers already assigned to them.
- Creating requires `master.create`; editing and changing active status require
  `master.update`. Viewers can inspect customer details but cannot save.
  Saves are transactional and audited. The form sends `updatedAt` to reject
  stale edits; on a conflict, close the form, reload, and reopen the record.

Invoice customer selection loads the Accounting Sale, VAT, credit term, Tax ID,
default branch and matching addresses. Branch and billing/shipping addresses are
selectable, and VAT/credit term can be overridden on the Invoice. Due date is
Invoice date plus credit days. The API validates branch/address ownership and
stores address, Sale-name and VAT snapshots so later master-data changes do not
rewrite those fields on existing Invoices. Legacy `salesId` retains its existing
creator-user meaning; `responsibleSaleId` references the Accounting Sale registry.
This does not add Invoice editing or complete the other AR document workflows.

### Database rollout

The new schema requires
`api/prisma/migrations/20261021020000_account_customer_management/migration.sql`
and a regenerated Prisma client **before** starting the updated API.
The migration preserves existing customers, creates one initial branch per
customer (with a `LEGACY` branch-code placeholder to review), and copies each
non-empty legacy address into that branch.
It does not invent missing customer codes or Sale assignments; complete those
on the customer edit form. The original scalar address columns remain as a
first-branch projection for existing readers.

Customer API writes now use `branches: [{ id?, code, name, addresses:
[{ id?, label, kind, address }] }]`, where `kind` is `billing`, `shipping` or
`both`. New customers require a code and at least one branch/address.
Scalar-only address updates are rejected explicitly; migrate older writers to
the structured payload. Customer updates omitting branches preserve them.
Accounting Sale endpoints are `GET/POST /api/account-sales` and
`PUT /api/account-sales/:id`, protected by the master-data permissions.
The AR-only customer lookup includes defaults/branches without granting
master-data write access.

Use the normal reviewed migration deployment process on a database with a
consistent history. If history differs, **do not run all pending migrations or
reset the database**. First verify the existing schema, then have the database
operator apply only this migration in a transaction and mark only
`20261021020000_account_customer_management` as applied. This change prepares the
migration only; it does not apply it to a shared database.

### Production data protection

The Customer change must not modify the legacy Sales UI, Sales customer/product
tables, users, quotations, work orders or their existing data. The new Sale
registry is `account_sales`, not the existing Sales users.

This migration is additive and Accounting-only:

- Create three new Accounting tables.
- Add nullable columns to `account_customers` and `invoices`. Existing column
  values and rows are not updated or deleted; the new columns start as NULL.
- Read existing Accounting customer addresses and insert copies into the new
  branch/address tables only. This is not a Sales customer import.
- No reset, seed, cleanup, merge, DROP, TRUNCATE, or UPDATE of existing rows.
  The canonical API tests include a static migration guard for this scope;
  this is not a substitute for testing the SQL against a restored database.

Deploying application code is not a database migration. The current `npm start`
only starts Node; inspect the actual hosting provider's build/pre-deploy/start
commands separately. Do not use `db:migrate` (development migration), `db:reset`,
`db:seed`, reset/cleanup scripts, `prisma db push`, or blanket migration deployment
against the divergent production history.

Before rollout, back up the database and verify it can be restored. Rehearse
only this migration against the restored copy, compare existing table row counts
and values before/after, and smoke-test both Sales and Accounting. Schedule the
schema change because ALTER TABLE can briefly lock Accounting tables. Apply only
the reviewed migration with explicit operator approval, generate the client, and
then start the updated API/UI. Deploying the new code without its schema can
break Accounting customer and Invoice requests even though it does not erase
data. If application rollback is needed, retain the additive schema; do not drop
new tables or columns containing user-entered data.

### Fax, secondary Sales and branch contacts

Customers have a fax field, a primary **Sale หลัก** (`responsibleSaleId`) and
optional **Sale รอง** (`secondarySaleIds`, stored in
`account_customer_secondary_sales`). Each branch can store its own contact
person, phone, fax and email. Email fields accept multiple addresses separated
by `,` or `;`. Updates omitting `secondarySaleIds` keep existing secondary Sales.

These columns/table are added by the idempotent, additive script
`api/scripts/sql/account-customer-import-support.sql` (ADD COLUMN IF NOT EXISTS /
CREATE TABLE IF NOT EXISTS only). Apply it, with approval and after a backup,
before deploying this API version.

### Importing customers from CSV

`api/scripts/import-account-customers.js` imports `Data/customer.csv` into the
Accounting customer tables only. Rules: rows sharing a valid 13-digit Tax ID
become one customer with one branch per original code, except configured Tax IDs
shared by different companies (`--separate-tax`), which become one customer per
company name; `*` Sale is the primary
Sale and other listed Sales are secondary; blank credit defaults to 30 days and
VAT to 7%; rows without an address are imported with a branch that has no
address (flagged "ยังไม่มีที่อยู่" in the customer list) and need an address
added before issuing documents. Branch addresses are optional in the API/UI.

1. Back up the database.
2. Apply `account-customer-import-support.sql`.
3. Dry run (no DB connection): `npm run db:import:account-customers:dry -- --report=plan.json`
4. Rehearse against the DB inside a rolled-back transaction:
   `node scripts/import-account-customers.js --check-db`
5. Import: `npm run db:import:account-customers:apply -- --performed-by=<userId>`

The import is insert-only: a customer is skipped when any of its codes, branch
codes or Tax ID already exists; it never updates or deletes Accounting rows and
never reads or writes Sales tables or users. Missing Accounting Sales are created
in `account_sales`.

## Accounting Purchase Orders

PO creation, editing and detail/printing use full pages at `/ap/vouchers/new`,
`/ap/vouchers/:id/edit` and `/ap/vouchers/:id`. They support direct links and
browser history; the PO sidebar entry stays selected on each page.

The PO form supports optional references to multiple active Sale PRs. PRs are
linked by their document numbers only; their item lines are not copied into the
PO. PO lines are entered separately and support multiple rows, item code,
description, quantity, unit, unit price, line discount and remark. Totals are
recomputed by the API using the existing 7% VAT convention or No VAT selection.
The supplier lookup supplies the initial supplier name, address, contact,
payment term, purchase type and VAT setting; these values can be adjusted on
the draft PO. Drafts can be edited and printed/downloaded through the browser's
print dialog. Approval and email delivery are not part of this phase.

The printable document uses the attached PO image as its layout reference and
reads company identity from the existing Settings record. The creator's name and
signature come from the user record. Approval signature areas remain unfilled
because this phase does not include an approval workflow. No unconfirmed footer
terms are added. Both PR attachments and PO-uploaded attachments are listed on
the document.

Before deploying these changes, back up the database and have an operator review
and apply `api/scripts/sql/accounting-purchase-orders.sql` to the target database.
It adds PO fields, attachment linkage, and a many-to-many PR reference table, and
backfills existing single-PR links. Generate the Prisma client from `api/` after
the reviewed schema rollout, then restart the API so it loads the generated
client. `Attachment.purchaseOrderId` maps to the SQL column `purchase_order_id`;
do not add a separate camel-case column. Do not apply a blanket migration or
reset a shared database.

## Date format

Accounting dates use `dd/mm/yyyy` with Gregorian years and the Asia/Bangkok
timezone, including PO printouts, lists and reports. Date fields accept this
format, validate actual calendar dates, and retain ISO `yyyy-mm-dd` values for
API requests and due-date calculations. Inventory timestamps retain their time
alongside the formatted date. This does not change the Sales UI.

## Checks

```powershell
npm ci
npm test
npm run lint
npm run build
```

Like the Sales UI, builds run TypeScript checking but lint runs separately.
Existing lint errors in transaction pages and the API client are not suppressed by
the lint command. The test suite covers access policy, React rendering, and
Tailwind layout utilities.

Accounting authorization tests are included in `npm --prefix api test`.

## Coolify install troubleshooting

Keep the install command as `npm ci` and commit `package-lock.json` alongside any
dependency changes. The lockfile includes the optional `@emnapi/runtime` peer
required by npm 10's clean-install validation; npm 11 may accept a lockfile without
that entry even though npm 10 rejects it.

If Coolify reports `Missing: @emnapi/runtime ... from lock file`, deploy the commit
with the repaired lockfile rather than replacing `npm ci` with `npm install`.
Node engine warnings are separate: some transitive tooling requires Node 22.13+
on the Node 22 line, so use a compatible build image instead of Node 22.11.