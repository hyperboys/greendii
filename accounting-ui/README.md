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

## Billing Notes (BI)

Open **ลูกหนี้ / รับชำระเงิน → ใบวางบิล**. The existing
`/ar/invoices?tab=billingNotes` opens the new register; direct pages are
`/ar/billing-notes`, `/ar/billing-notes/new`, `/ar/billing-notes/:id` and
`/ar/billing-notes/:id/edit`.

- Choose one customer and multiple confirmed new-lifecycle invoices with positive
  outstanding balances. Each billing amount can be partial, strictly positive and
  at most the current outstanding balance. The API recomputes the total in satang.
- A given Invoice can be reserved by only one non-cancelled, not-completed BI,
  including Draft and existing legacy BI records. RV completion releases the
  remaining debt for rebilling; partial payment alone does not. Source checks run
  under shared, sorted Invoice locks, followed by BI locks.
- `ar.create` permits create/edit Draft, direct confirmation and reason-required
  cancellation. Confirmed documents cannot be edited. `ar.view` permits read/print.
  BI never creates/reduces Invoice debt and never posts Stock or GL.
- Confirmation checks current balances again; a changed balance requires Draft
  review, not silent confirmation of stale amounts. Cancellation and Draft edits
  are blocked by effective confirmed RV/CN after the BI was created (or a
  confirmed RV explicitly linked to that BI). RV confirmation time, not Draft
  creation/document date, is used for new receipts. Draft RV does not block BI.
  Cancellation also rejects inconsistent remaining balances. No force-cancel or
  downstream reversal is included.
- Customer identity/address and invoice number/date/due date/net amount are saved
  as snapshots. Printed totals are billing snapshots, not current AR balances.
  During Draft editing the form shows the linked invoices' current outstanding.
- Printing recreates the full form on **plain paper** from
  [ใบวางบิล.pdf](../Doc/accounting/ใบวางบิล.pdf), unlike Invoice data-only printing.
  It includes company Settings, customer/document boxes, seven columns, final-page
  total, remarks and blank billing-party/recipient signature areas. A4 portrait,
  17 invoices per page; headers/page numbers repeat, rows do not. Print is enabled
  only for confirmed new records after text-fit validation. Use actual size 100%
  with browser headers/footers off and run physical-printer UAT.
- Run the reviewed additive
  [accounting-billing-notes.sql](../api/scripts/sql/accounting-billing-notes.sql)
  after backup and the SO/Invoice prerequisites. Generate Prisma, restart the API
  and deploy UI together; do not reset the database. This SQL has **not** been
  applied to the target database by the agent. Legacy BI records remain version 0,
  read-only in this lifecycle, without status/balance backfills.

BI receipt selection, automatic completion/release and guarded reopening are
implemented by RV below. HTTP tests use transactional database substitutes, and
browser tests mock persistence: target PostgreSQL concurrency/rollout and real-data
UAT remain required.

## Receipt Vouchers (RV)

**รับชำระเงิน** opens the RV register at `/ar/receipts`, not an unpaid-invoice
list. New/view/edit routes are `/ar/receipts/new`, `/ar/receipts/:id` and
`/ar/receipts/:id/edit`; all use full pages and dd/mm/yyyy dates.

- Search one customer, add multiple confirmed new-lifecycle Invoices or a
  confirmed BI's eligible invoices. A direct Invoice receipt automatically
  links its active confirmed BI. Draft/legacy BI reservations must be resolved
  first. A changed BI link requires Draft review before confirmation.
- Enter baht per Invoice: **debt reduction = net cash + WHT + company-borne bank
  fee**. Debt 1,000 / cash 960 / WHT 30 / fee 10 closes 1,000. The API validates
  exact satang, current Invoice balance and remaining billed portion, then sums
  headers. No overpayment, advance, percentage calculation or cheque processing.
- Cash and transfer only. Transfer requires bank name/reference; WHT requires
  certificate number. `ar.create` manages Drafts, confirms directly and cancels
  with a reason; `ar.view` reads/prints. Draft does not change debt; confirmed RV
  cannot be edited. Legacy version 0 remains read-only and is not converted.
- Confirmed allocations fully settling a BI's **billed portion** set its
  `completedAt` while retaining `approved` status. This releases the Invoice for
  billing remaining debt. Cancellation restores cash+WHT+fee and reopens the BI,
  but is blocked if any non-cancelled BI was created after completion on any
  Invoice in the original BI. Cancel that newer BI first, subject to its guards.
  Cancellation cannot restore the same amount twice.
- Optional evidence files can be uploaded/deleted on a saved Draft's detail page.
  Both operations check `ar.create`, RV row lock/revision and Draft state,
  update revision and write audit records transactionally. Confirmed/legacy/
  cancelled RV evidence cannot be changed. Upload uses existing storage/type/
  size limits (up to 10 files per request).
- Plain-paper printing follows [ใบสำคัญรับ.pdf](../Doc/accounting/ใบสำคัญรับ.pdf):
  journal header, six-column debit/credit grid, deposit-bank row, blank signature
  boxes and Invoice/BI allocation detail. Per user confirmation, account names
  and debit/credit settlement summaries are shown, but account codes, department,
  project and signatures remain blank: **this does not post GL**. Six Invoice
  lines per A4 page; summary totals only on the final page. Final printing,
  including Ctrl+P, is blocked for unconfirmed/legacy records or text/page
  overflow. Use actual size 100%, browser headers/footers off; printer UAT remains.

Rollout: back up and review/apply SO/Invoice/BI prerequisite SQL, then
[accounting-receipts.sql](../api/scripts/sql/accounting-receipts.sql). From `api`,
run `npx prisma generate`, restart the API and deploy UI together. The additive SQL
preserves historical balances/statuses; **it has not been applied by the agent**.
Local Prisma validation/generation does not migrate the target database.

Real PostgreSQL concurrent transactions, evidence storage deployment and printer/
real-data UAT remain operator checks. CN is implemented below; refunds,
cheques, advances, GL mappings/posting, multi-step approval, notifications and
historical as-of reporting are separate processes, not silently inferred here.

## Credit Notes (CN)

Open **ลูกหนี้ / รับชำระเงิน → ใบลดหนี้** at `/ar/credit-notes`. Create/view/edit
use `/ar/credit-notes/new`, `/ar/credit-notes/:id` and
`/ar/credit-notes/:id/edit`, with full-page forms, searchable Invoice and
dd/mm/yyyy dates. No modal.

- One confirmed new-lifecycle Invoice per CN; customer/branch/address/tax and
  Invoice number/date/VAT are copied from the Invoice, not editable master data.
  The Invoice reference cannot change after saving.
- Enter multiple credit lines with description, optional item code, unit, positive
  integer quantity and credit unit price **before VAT**. These are price-credit
  descriptions, not returns or changes to original Invoice lines. No Stock,
  refunds, advance credit or GL posting occurs.
- The API computes satang totals and document-rounded VAT from the original
  Invoice's `VAT7%`/`NO_VAT`. Per-line VAT uses cumulative differences so it sums
  to the header. Confirmed non-cancelled CNs, including Legacy, consume separate
  pre-VAT, VAT and net capacities. All three must stay within the original Invoice
  and the new credit cannot exceed current outstanding. A fully paid Invoice is
  ineligible; partial payment permits only the remaining debt. Tax-cap rounding
  conflicts are rejected explicitly, not silently adjusted.
- Draft has no balance effect. `ar.create` manages Draft/confirmation/cancellation,
  `ar.view` reads/prints. Confirmation revalidates under the shared Invoice lock,
  reduces debt once and freezes the CN. Cancellation requires a reason and
  restores the exact net credit once. Revision and transactional audit protect
  all writes. Legacy version 0 remains read-only, with no historical conversion.
- Draft CN may be saved while BI is active, but confirmation is blocked until the
  non-completed BI (including Draft/Legacy) is resolved. Reverse its effective
  RVs and cancel the BI where its guards permit; CN never silently adjusts BI.
  Draft CN no longer counts as an effective credit blocking BI editing/cancel.
- Confirmed CN cannot be cancelled while a later effective RV or a newer/reused
  non-cancelled BI depends on the Invoice. RV confirmation time matters, not its
  Draft creation/document date. BI active/updated timestamps also prevent reusing
  an old Draft to bypass the dependency guard. BI creation timestamps are assigned
  after Invoice locks, avoiding PostgreSQL transaction-start timestamp ordering.
- Plain-paper output follows [ใบลดหนี้.pdf](../Doc/accounting/ใบลดหนี้.pdf):
  company Settings, customer/source/reason boxes, seven-column credit grid,
  original pre-VAT value, corrected value after cumulative CNs, this CN's
  pre-VAT/VAT/net totals and blank signatures. Prices are amounts being credited;
  the separate sample discount column shows a dash, not another deduction.
  Delivery/ownership assertions from the sample are intentionally omitted.
  Twelve lines per A4 page, final-page totals only; text/page fit guards block
  final print and Ctrl+P on overflow, Draft/cancelled/Legacy. Use 100% actual size,
  browser headers/footers off and validate against the physical printer.

Back up/review/apply SO/Invoice/BI/RV prerequisite SQL, then
[accounting-credit-notes.sql](../api/scripts/sql/accounting-credit-notes.sql).
Run `npx prisma generate` from `api`, restart the API and deploy UI together.
**The agent has not applied SQL to the shared database.** PostgreSQL concurrency,
real-data and printer UAT remain outstanding. Multi-step approval, CN attachments,
refunds/returns, GL, notifications and historical as-of reports are not in this
agreed CN phase.

## Invoice lifecycle and preprinted output

Open **ลูกหนี้ / รับชำระเงิน → ใบแจ้งหนี้ / ใบกำกับภาษี**.
`/ar/invoices` and `?tab=invoices` open the register. Create, detail and edit
are full pages at `/ar/invoices/new`, `/ar/invoices/:id` and
`/ar/invoices/:id/edit`.

- New lifecycle invoices start as Draft with zero outstanding balance.
  Users with `ar.create` can edit Drafts, confirm and cancel; `ar.view` is read-only.
  Confirmation records an audit event, changes status to `approved` (shown as
  confirmed) and sets outstanding to the net amount once. It does not post Stock
  or GL journals and does not run a multi-step approval chain.
- Multiple lines support integer quantities, unit, product/code or manual entry,
  description/remark, prices excluding VAT, line/document discounts in baht and
  VAT 7% / No VAT. The server recomputes amounts in satang, ignoring client totals.
  The compact item editor is shared with SO.
- Optional SO selection copies all lines, shipping, credit, VAT and discounts
  from one non-cancelled SO, authoritatively on the server. Source rows are
  read-only. Only one non-cancelled Invoice may reference a given SO, including
  existing legacy links. Cancelled invoices release the SO for a new invoice.
  The source cannot change after saving; cancel and recreate instead.
- Confirmed invoices cannot be edited. Cancellation requires a reason, rejects
  active BI/RV/CN dependencies or an inconsistent remaining balance, and leaves
  the document/history intact with zero outstanding. Invoice writes, BI, RV and CN
  serialize on the same invoice row; SO selection serializes with SO edits/cancel.
- New Drafts cannot be billed, received against or credited, including direct API
  requests. The unpaid lookup excludes them. These guards do not complete the
  remaining BI/RV/CN screens, WHT/fee rules or reversal workflows.
- `lifecycleVersion = 0` identifies existing records. Their statuses and balances
  are not rewritten; they are read-only in the new lifecycle. Existing non-cancelled
  legacy documents retain their previous downstream eligibility until reviewed
  under a separate reconciliation/migration procedure.
- Confirmed new invoices print **data only** onto preprinted stationery using
  the field geometry from `Doc/accounting/invoice.pdf`. The user confirmed that
  stationery despite its printed RECEIPT heading. No logo, form title, table
  borders, payment-method entries, receipt signatures or payment acknowledgement
  are generated. Preview is intentionally mostly blank. Totals appear on the
  final page only; oversized rows continue without repeating quantities/money.
  Printing is blocked for Draft/cancelled/legacy documents and for header data
  which cannot fit even after bounded font reduction.
  Use A4 portrait, actual size 100%, disable browser headers/footers, and calibrate
  on the actual printer/stationery before issuing documents. A browser PDF check
  is not physical-printer certification.

Before deployment, back up and have an operator review/apply
`api/scripts/sql/accounting-invoices.sql` alongside the earlier SO PDF schema
rollout. It adds lifecycle/snapshot/line columns and a partial source uniqueness
index; there is no historical balance/status update. Then run Prisma generate
in `api` and restart API/update UI together. Do not reset a shared database.
The agent has validated/generated the client locally but **has not applied this
SQL to the target database**. Avoid mixed old/new API instances during rollout.

Validation includes real Express HTTP handlers with an in-memory transactional
test substitute and browser flows with mocked persistence. PostgreSQL lock/
concurrency tests, legacy reconciliation and target-database/printer UAT remain.

## Provisional Delivery Orders (SO) — Draft phase

Open **ลูกหนี้ / รับชำระเงิน → ใบส่งของชั่วคราว**. Existing
`/ar/invoices?tab=so` links display the new SO list; `/ar/delivery-orders`
also opens it directly. New, detail/print and edit pages are
`/ar/delivery-orders/new`, `/ar/delivery-orders/:id` and
`/ar/delivery-orders/:id/edit`. The SO sidebar entry remains active on each route.

- Create and edit Drafts with multiple lines, active Accounting products or
  manually entered item codes/descriptions, positive integer quantities (step 1),
  units, unit prices, line discounts in baht and line/document remarks. Customer
  and document date are required, as are each line's description, quantity and unit.
  Items are edited in a compact table with product/code, quantity, unit, price,
  discount and live amount columns. Each item's multiline description and remark
  sit underneath its main row rather than occupying a separate column.
  Add-row buttons are available above and below the table; at least one row must
  remain. Small screens stack fields with labels, without horizontal scrolling.
- Select a customer/branch and shipping address from Accounting master data;
  shipping address and receiver can be entered on the document. Optional Work
  Orders are searched by number/project and referenced only, without copying
  their lines or changing Sales records.
  Customer and Work Order each use one searchable dropdown: open the field,
  type a code/name or WO number/project, then click a result or use arrow keys
  and Enter. Escape or leaving the field discards the search without changing
  the selection. Choose **ไม่อ้างอิง WO** to clear the optional reference.
  WO searches show loading/error/empty states and retain the selected label
  even when it is not in the current search results. Customer selection still
  fills the existing branch/address, contact, credit and VAT defaults.
- **No SO confirmation/approval or Stock posting is enabled in this phase.**
  Creating, editing, printing or cancelling SO does not change Stock.
- `ar.view` permits list/detail/print. `ar.create` additionally permits creation,
  Draft editing and cancellation; SO PUT uses this existing permission rather
  than introducing an unapproved AR role action. Read-only users cannot write.
- Cancellation requires a reason and preserves an audit trail. Editing and
  cancellation are blocked if any non-cancelled Invoice references the SO.
  Cancelled SOs are read-only and cannot be used by the Invoice create API.
  Edit requests require the loaded `updatedAt` to prevent overwriting a newer
  revision. SO edits/cancellation and Invoice creation lock the same SO row.
- The A4 print layout follows
  [ใบส่งของชั่วคราว.pdf](../Doc/accounting/ใบส่งของชั่วคราว.pdf):
  **TEMPORARY INVOICE**, company header from Settings (no added logo), number/date
  box, customer address/phone/fax, delivery date, credit days, seven item columns,
  monetary summary and three signature boxes. The creator's name appears under
  the sender; recipient and authorized-person signatures remain blank. Status
  and the no-Stock notice appear in remarks, not as an approval claim.
  Reservation number/date and billing conditions deliberately remain blank per
  the user's decision, not substituted with WO. Existing optional WO/receiver
  information is retained in remarks. Print/Save PDF uses the browser dialog.
  Standard multi-page documents repeat the header, show page numbers and print
  document totals only on the last page.
- Prices exclude VAT. Each line amount is quantity × unit price minus line
  discount; **รวมเงิน** sums those net line amounts. The document discount in baht
  is then deducted before calculating 7% VAT (or No VAT). API calculations use
  integer satang and ignore client-supplied totals. Price/discount inputs allow
  at most two decimal places, cannot be negative or exceed their applicable
  gross/net base, and totals must fit the existing Decimal(12,2) range.
- Product selection initially fills code/unit/price; customer/branch selection
  fills phone/fax, and customer selection fills credit/VAT defaults. These
  document fields remain editable in Draft, are saved and are not replaced from
  today's master when reopening an existing document. These SO amounts do not
  create receivables or alter the future Invoice workflow.

API routes: `GET/POST /api/ar/delivery-orders`,
`GET/PUT /api/ar/delivery-orders/:id`,
`POST /api/ar/delivery-orders/:id/cancel` with `{ "reason": "..." }`,
and `GET /api/ar/delivery-orders/work-orders?q=...` for the create-permission
lookup. Existing optional paginated SO list responses remain supported.

The PDF-field extension requires
[`api/scripts/sql/accounting-delivery-orders.sql`](../api/scripts/sql/accounting-delivery-orders.sql).
Back up the target database, review and apply that additive, transaction-wrapped,
re-runnable script before running this API. It adds monetary/header fields to
existing SO/line tables only; **no shared database migration is applied by the
assistant**. Existing documents retain zero monetary values and credit default
30; historical prices and contact information are not inferred from today's
master. Review existing Drafts before printing them as priced documents.
After rollout, stop the API, run `npx prisma generate` from `api/`, restart the
API, and rebuild/restart the UI. Do not use `prisma db push`, reset the database
or deploy unrelated migrations to install these fields.
The previously required Accounting master/audit schema must already be present.
HTTP tests use real Express/auth/permission handlers with an isolated in-memory
database substitute; production PostgreSQL locking and target-database UAT still
need verification. Invoice line import/partial invoicing is the next process,
not part of this Draft batch.

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