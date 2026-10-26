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

### Purchase order approval (PO prerequisite for GR)

PO now has one-step approval for **both domestic and overseas** purchases, as
explicitly agreed for this phase. Open `/ap/vouchers?tab=po` and the separate PO
detail page to submit/review/print. The register includes status filtering and
purchase type; document view shows history with actor, time and reason.

| Action | Permission (plus ap.view) | Allowed state |
| --- | --- | --- |
| Create | ap.create | New Draft |
| Edit | ap.update | Draft / returned |
| Submit | ap.create | Draft / returned |
| Approve / return / reject | ap.approve | Pending |
| Cancel with reason | ap.cancel | Draft / returned / pending / approved |

The creator cannot approve their own PO, **including admin**. Return/reject/cancel
require a reason. Rejection/cancellation are terminal; no silently reopening an
approved order. Return/reject/cancel block when any noncancelled/nonrejected PS
or GR exists, including drafts and legacy records. Close/reverse downstream
documents through their own workflows first; cancelling PO does not reverse
stock or payments. Existing PS policy permitting Draft PO remains unchanged;
this round does not silently restrict previously agreed PS sources.

PO row locks serialize status, edits and files against PS/GR creation. Every
update/action/file upload/delete requires the latest `updatedAt`; stale/missing
revisions return 409. Updates retain linked product IDs instead of losing them
when a form is rehydrated. Submit/approve validate active supplier/product,
purchase type, supported VAT and server-calculated line totals. Historical POs
without a creator cannot be submitted without reconciliation.

PO evidence uses the shared transactional PV/CQ upload path: only PDF/JPG/PNG,
category `accounting-po`, one document binding, create or update permission,
Draft/returned only, with revision bump/audit/storage cleanup on rollback.
Files freeze in pending/approved/rejected/cancelled states. After uploading from
the detail page, load the fresh document revision before the next action.
Manual API callers must now send `updatedAt` for PUT/status/multipart upload/
DELETE; legacy PO file categories can be removed while editable but new uploads
must use `accounting-po`.

Printing displays the actual status and approval actor/date from saved history,
leaving the signature line blank (not a digital signature). New audit records
snapshot the actor name so later user renames do not rewrite approval identity.
Legacy approved documents without approval history are labelled honestly.
Printing/PDF does not submit/approve. No separate domestic/overseas approval
routing, supplier email, notification/inbox, FX or GL posting is included.

No new database schema/migration is required by **this PO approval batch**.
Deploy matching API/UI, verify role grants and run target PostgreSQL/concurrent-
user/storage/printer UAT; existing Accounting/master/PV/CQ rollout prerequisites
still apply. No shared SQL was executed or user API stopped.

The subsequent GR batch is implemented below; PO approval alone does not post stock.

### Goods receipts (GR)

Open AP > GR (`/ap/vouchers?tab=gr`); new/view/edit are separate pages under
`/ap/vouchers/gr/`. Search GR/PO/supplier, filter status, paginate 20 rows and
export **all filtered records** as UTF-8 BOM CSV using shared formula protection.
Use searchable approved-PO, matching-unit product/service and warehouse selectors.
Line cards show ordered, already received, pending elsewhere, remaining and current
receipt quantities without horizontally scrolling the entry form.

Only approved PO from active suppliers can be received. Every receipt line links
to an actual PO line; unmapped manual lines require explicit active master mapping
with the same unit. Mapping is fixed by PO or other pending/approved receipts.
No extra lines, unit conversion, PO price editing or automatic PO closing. Receive
up to three decimals; one PO and one warehouse per GR when goods exist. Separate
receipts support partial quantities and multiple warehouses. Services require no
warehouse and never change stock.

| Action | Permission (plus ap.view) | Effect |
| --- | --- | --- |
| Create Draft | ap.create | No quantity reservation / stock |
| Edit Draft / returned | ap.update | Revalidates current PO capacity |
| Submit | ap.create | Requires sender/receiver + gr-receipt evidence; reserves PO quantity |
| Approve pending | ap.approve | Posts goods stock + movement, not service stock |
| Return / reject pending | ap.approve | Reason required; releases reservation |
| Cancel Draft / returned / pending / approved | ap.cancel | Date + reason; approved receipts reverse stock and restore PO capacity atomically |

Creators cannot approve their own GR, **including admin**. Return permits
correction and resubmission; rejection/cancellation are terminal. `GRYYMMXXXX`
is issued at Draft creation using Gregorian year/month; PO and receipt date then
remain immutable and issued numbers are not reused. On every submit/approve,
server calculations ignore forged ordered/received/remaining values and check
current PO capacity, active master/unit/warehouse and product-type snapshot.
Revisions guard every edit/action/file mutation; request keys deduplicate creates.

Evidence is PDF/JPG/PNG, category `gr-receipt`, bound only to this GR, editable
with create or update permission while Draft/returned. Submit/approve require
at least one receipt evidence file; files freeze after submission unless returned.
Shared storage limits, transactional audit and rollback cleanup apply.
Detail shows saved identities, quantities, actor/time/reason history and original/
reversal movement references. A4 full-frame printing includes blank signatures,
repeats headers and up to seven rows per page, prints every item once and blocks
print/Ctrl+P when text cannot fit at the minimum font size. Printing never approves.
This is the agreed generic GR sheet; no GR reference PDF was supplied.

GR locks GR -> PO -> warehouse; source/create lock PO. Warehouse row locks also
serialize the existing issue/return writers against GR balance creation/reversal.
Approval, balances, movements and audit are one transaction. Whole-document
approved cancellation requires enough available stock without consuming reserved
stock; no negative balance, erasure of original movements or duplicate reversal.
Cancellation date cannot precede receipt or the affected product's latest stock
movement. No supplier partial returns, damage/quarantine, costing, GL, multi-step
approval, inbox or notification is added. The subsequent Stock Issue and Stock
Return batches are documented below.

**Rollout:** review/backup/apply
[`accounting-goods-receipts.sql`](../api/scripts/sql/accounting-goods-receipts.sql)
after existing Accounting/master/PO/evidence prerequisites, then generate Prisma
and deploy matching API/UI. The additive script leaves old GR version 0/read-only;
PO with active legacy/unlinked GR is blocked until audited reconciliation. No
automatic backfill or old stock adjustment. No shared SQL was executed. Schema
validation passes; client generation encountered Windows engine-DLL `EPERM`.
An operator must arrange an API maintenance window, generate and restart; the
assistant did not stop the user's API.

Validation: API 115/115, focused voucher UI 21/21, production build/types/focused
lint/schema validation; browser 109 HTTP requests with no page errors, including
6+4 across warehouses, return/edit/resubmit, service 0.125 without stock, reversal,
role gates, evidence, responsive 320-1440px, 20+7 pagination and filtered CSV.
Actual A4 PDFs: 1 item = 1 page, 17 items = 3 pages; overlong text blocks printing.
Full UI 72/73: the pre-existing BI fixed-date fixture still fails. HTTP/browser
tests use real Express/auth/routes with transactional in-memory Prisma and storage
substitutes, not real PostgreSQL concurrency or actual storage. Target DB,
concurrent-user, storage and physical-printer UAT remain mandatory.

### Stock issues (IS)

Open Inventory > Stock issues (`/inventory?tab=issues`). Separate new/view/edit
pages live under `/inventory/issues/`; balance/movement tabs remain available.
Search IS/WO/requester/receiver, filter status, paginate 20 rows and export **all
filtered records** as formula-protected UTF-8 BOM CSV. The entry form uses
searchable warehouse/product/optional-WO selectors and line cards, not a modal or
a horizontally scrolling entry table.

One active warehouse per document; only active stored/manufactured products with
master units, no duplicate products/services/unit conversion. Quantities allow up
to three decimals. Requester and receiver names are mandatory. Requested and
planned issued are separate: request 10 / issue 5 cancels the remaining 5 on
approval, with no backorder. Individual zero-issued lines are allowed if another
line is positive. Draft/pending do not post **or reserve** stock.

| Action | Permission (plus inventory.view) | Effect |
| --- | --- | --- |
| Create Draft | inventory.create | Number and snapshots only |
| Edit Draft / returned | inventory.update | Revalidates active master/unit/type |
| Submit | inventory.create | Pending; no stock reservation |
| Approve pending | inventory.approve | Actual recorded issue; deducts planned issued quantities |
| Return / reject pending | inventory.approve | Reason required; return allows correction |
| Cancel Draft / returned / pending / approved | inventory.cancel | Reason + date; approved adds exactly issued stock back only after confirmation all goods physically returned |

Creators cannot approve their own issue, **including admin**. Insufficient current
available stock returns an explicit error: return for correction/reapproval; the
server never silently reduces the planned issue. Posting preserves reserved and
requires available = onHand - reserved, no negative stock. Approval, balances,
movements and audit are transactional under issue -> warehouse locks.

Whole-document approved cancellation requires a physical-return checkbox; its
confirmation is saved in audit. Active Draft/pending/approved returns block
cancellation. Date cannot precede issue or the latest affected stock event.
Linked reversals preserve original movements and cannot run twice. This is not
the partial Stock Return workflow.

`ISYYMMXXXX` is Gregorian/monthly, issued at Draft creation without number reuse.
Warehouse/date are immutable after issuance. Request keys deduplicate creates;
every edit/action/upload/delete needs the latest `updatedAt`. Legacy version 0
is read-only: no automatic conversion or changes to old stock.

Optional PDF/JPG/PNG evidence uses category `stock-issue`, a single issue binding,
Draft/returned only, create or update permission, transactional revision/audit
and rollback cleanup. Submit does not require evidence. Multipart clients must
omit JSON Content-Type. Detail shows saved quantities/identities/history and
original/reversal movements; stock movement tables link to IS/GR sources.

A4 printing uses the agreed generic full-frame form, eight items/page, repeated
headers and blank signature lines; no supplied IS reference template. It never
changes status and blocks print/Ctrl+P when text cannot fit. No costing/GL,
opening balances, transfers, inbox or notifications.

**Rollout:** backup/review/apply
[`accounting-stock-issues.sql`](../api/scripts/sql/accounting-stock-issues.sql)
after Accounting/master/GR/evidence prerequisites, generate Prisma, restart and
deploy matching API/UI; grant inventory approve/cancel explicitly. No shared SQL
or db push was run and no user API was stopped. Prisma validate **and generate
passed locally in this batch** (superseding earlier batches' DLL-lock failure);
this does not prove the shared database schema matches.

Validation: API 123/123; focused UI/navigation/access 15/15; production build,
types and focused lint pass. Full UI 77/78 retains the pre-existing BI fixed-date
fixture failure. Browser: 73 HTTP requests, no page errors, request10/issue5/
cancel5 plus zero-issued line, optional files, return/edit/resubmit, independent
roles, insufficient-stock error without auto-reduction, stock7->2->7/reserved2,
physical-return confirmation, 320-1440px, 20+7 pagination and filtered CSV.
Actual PDF: two items/one page and 17 items/three pages; long text blocks printing.
HTTP/browser use actual Express/auth/routes with isolated transactional in-memory
Prisma/storage substitutes, **not PostgreSQL concurrency or real storage UAT**.
Target DB, concurrent-user, storage and physical-printer UAT remain mandatory.

The subsequent Stock Return batch below replaces the old immediate-posting
return endpoint. Legacy and unlinked returns cannot be created through it.

### Stock returns (SR)

Open Inventory > Stock returns (`/inventory?tab=returns`). New/view/edit are
separate pages under `/inventory/returns/`. Search SR/IS/sender/receiver, filter
status, paginate 20 rows and export **all filtered records** as protected UTF-8
BOM CSV. Searchable source and line selectors show actual issued, previously
returned, pending elsewhere and returnable quantities in cards.

One SR references one **approved version1 IS** and its actual issued line IDs.
Only good stored/manufactured goods are accepted into the **original warehouse**,
with original snapshot units and max3 decimals. No services, zero-issued lines,
duplicate lines, unrelated products, damaged goods, unit conversion, different
warehouses or source-free returns. WO is copied as a reference without mutation.
Sender, receiver and return reason are mandatory.

Partial returns are supported. Approved + pending returns cannot exceed **issued**
quantity (not requested): issue5 -> return3 -> return2, then no further return.
Draft/returned do not reserve anything. Pending reserves source return capacity
but **does not add stock or change stock reserved**. Server recalculates under
IS row lock on save/submit/approve; client quantities/counters/warehouse are not
authoritative. Current master active/unit/type must still match the issue.
Snapshots preserve historical product identity despite master name changes.

| Action | Permission (plus inventory.view) | Effect |
| --- | --- | --- |
| Create Draft | inventory.create | Monthly number and saved source only |
| Edit Draft / returned | inventory.update | Source/date immutable; recalculate capacity |
| Submit | inventory.create | Pending reserves IS return capacity only |
| Approve pending | inventory.approve | Actual receipt of good goods, add stock/movements |
| Return / reject pending | inventory.approve | Mandatory reason; release pending capacity |
| Cancel active document | inventory.cancel | Mandatory date/reason; release source capacity; approved reverses stock only after physical removal confirmation |

No creator self-approval even admin. Every mutation requires latest `updatedAt`.
Request-key advisory locks deduplicate creates. Lock order SR -> IS -> warehouse;
IS cancellation checks all active SR under the same IS lock, including Draft/
returned. Posting, state and audit commit together; no duplicate stock movement.

Approved cancellation is whole-document only and requires confirmation that all
returned goods actually went back out. Confirmation is saved in audit. Linked
stock-out reversals require sufficient available without consuming reserved,
negative stock or hiding inconsistent balances. Date cannot precede return date
or latest affected stock event. Original movements/history are never erased.

Optional PDF/JPG/PNG evidence uses category `stock-return`, only this document
binding, Draft/returned only, create or update permission, revision/audit and
rollback storage cleanup. Files freeze while pending/approved or terminal.

`SRYYMMXXXX` is Gregorian/monthly, issued at Draft creation, no reuse. Legacy
version0 documents are read-only; active legacy/unmapped returns block further
returns on the source until reconciliation. The old immediate writer is removed,
not retained as a bypass. No legacy conversion/backfill or old stock adjustment.

Generic full-frame A4 shares the IS print layout/fit guard: eight rows/page,
saved identities/quantities, blank signatures, repeated headers, every row once.
Remaining quantities are labelled **at recording time**, not a live promise.
Printing never changes state; long text blocks print/Ctrl+P. Movement tables link
to SR/IS/GR sources. No damaged/quarantine/costing/GL/opening/transfer/inbox.

**Rollout:** backup/review/apply
[`accounting-stock-returns.sql`](../api/scripts/sql/accounting-stock-returns.sql)
after Accounting/master/GR/IS/evidence prerequisites, generate Prisma, restart
and deploy matching API/UI with inventory create/update/approve/cancel grants.
The additive SQL adds line FK/snapshots/lifecycle/evidence only; **no shared SQL/
db push or user API stop was performed**. Local Prisma validate/generate pass;
this is not confirmation of the shared database schema.

Validation: API 131/131, focused stock UI/navigation/access 20/20, build/types/
focused lint/schema/generate pass. Full UI 82/83 retains the existing BI fixed-date
fixture failure. Actual browser SR99 requests/0page errors: issue5 -> return3+2,
pending capacity without stock, files upload/delete, return/editor edit/maker
resubmit/approver receipt, physical removal and insufficient-stock cancellation,
stock2->5->7->4->2/reserved2, legacy/viewer, responsive320-1440px, 20+7 pages and
all-filtered CSV. Actual PDFs one item/one page, 17items/three pages with fitting
footers; long text blocks print. IS regression browser73 requests/0errors and its
1/3-page PDFs still pass after shared print helper extraction.

HTTP/browser use real Express/auth/routes with isolated serialized in-memory
Prisma/storage substitutes, **not real PostgreSQL locking/concurrency or storage**.
Target PostgreSQL/concurrent-user/storage/physical-printer UAT remains required.
Next proposed scope is stock opening/card/reporting under Q14/Q16, which still
needs policy confirmation; do not infer costing or adjustment behavior.

### Cheque payments (CQ)

Open AP > cheque payments (`/ap/vouchers?tab=cq`); new/view/edit are separate pages
under `/ap/vouchers/cq/`. The register searches CQ/PV/cheque number/payee/company
bank/account, filters status, paginates 20 rows and exports **all filtered rows**
as UTF-8 BOM CSV, not just the current page. Account/cheque numbers remain text;
existing CSV escaping/formula protection is reused. `ap.view` permits read/print/
CSV; no separate export permission is introduced.

Select one new approved/unpaid **cheque-method PV at its full net amount** using
a searchable dropdown. Saved PV/PS/PO/supplier/amount snapshots do not follow later
master edits. Company payer bank/name/branch/account are entered on CQ; this is not
the supplier's receiving account and no company bank master is introduced.
Account numbers accept 6-30 digits, optional spaces/hyphens, retain leading zeros,
and normalize for uniqueness; cheque numbers accept letters/digits and normalize
to uppercase. Bank account + cheque number cannot be reused even after cancellation.
Legacy normalized identities are checked too, without rewriting old rows.

`CQYYMMXXXX` is a Gregorian monthly sequence issued at creation, separate from the
bank's cheque number; cancelled document numbers are never reused. PV/account/
cheque number/document date become immutable on creation to preserve numbering
and identity history. `ap.update` can edit other fields only while Prepared.

| Transition | Permission (plus ap.view) | Required data |
| --- | --- | --- |
| Create Prepared | ap.create | PV, document/cheque dates, bank/branch/account, cheque number, payee |
| Prepared -> Printed | ap.create | Actual cheque-printing date |
| Printed -> Signed | ap.approve | Signing date and signer's name |
| Signed -> Released | ap.pay | Release date, recipient and cq-release evidence |
| Released -> Cleared | ap.pay | Bank clearing date, reference and cq-clear evidence |
| Cancel before release | ap.cancel | Date and reason |
| Reverse after release/clear | ap.cancel + ap.pay | Date, reason, reference and cq-reversal evidence |

No step skipping. Recording signing is not another approval of PV; a creator
with `ap.approve` may record an externally signed cheque, as agreed. Dates are
chronological, CQ document date is not before PV, clearing cannot precede the
cheque date, and **postdated cheques may be released before their cheque date**.
Released atomically sets PV paidAt/by/recipient/payer bank/reference; Cleared
stores a separate bank date and never pays PV twice. These actions record events
performed outside the application; no bank transfer, stop-payment or bank API
operation occurs.

Cancellation before release leaves PV approved/unpaid for a replacement cheque
with a new number. Cancellation after release/clear atomically cancels CQ and
reverses/cancels PV, preserving original payment/clearing/evidence/history. It
releases PS for a **new PV**, not re-payment of the old PV, and never cancels PS or
releases its PO capacity. Verify return/stop-payment/refund externally first.
Active cheques block direct PV cancellation; PV links to CQ for the correct
reversal process. Legacy CQ/linked legacy PV remain read-only until reconciled.

Evidence uses existing upload storage/size limits with PDF/JPG/PNG restrictions.
Prepared/Printed document evidence needs create or update; Signed release evidence
needs pay; Released clearing evidence needs pay, and Released/Cleared reversal
evidence needs pay+cancel. Each completed stage's evidence freezes; cancelled
records cannot change attachments. Revisions guard uploads/deletes/status/edit;
request keys deduplicate creation/retries. CQ locks CQ -> PV -> PS -> PO, creation
locks PV -> PS -> PO; payment/reversal/audit changes share one transaction.

**Printing:** A4 cheque-details sheet with company/PV/PS/PO references, bank and
payee, amount, dates/references/status/reversal and blank signatures. It is **not
bank cheque overprinting**. Viewing/printing/PDF never advances status: Printed
must be explicitly recorded after actual external printing. Long text is fitted
within a minimum font size; overflow blocks printing with an explicit error.

**Rollout:** Back up/review and apply
[`accounting-cheque-payments.sql`](../api/scripts/sql/accounting-cheque-payments.sql)
after Accounting/master/PS/PV/attachment prerequisites. New lifecycle/evidence/
snapshots/stage fields and unique indexes are additive; legacy numbers, money and
statuses are unchanged. Existing raw bank/cheque unique constraint is retained,
with normalized identity and active-PV indexes as new-record backstops. Reconcile
legacy data separately; do not relabel it version 1 without audited migration.
No shared SQL was applied. Schema validation passes; Prisma client generation hit
Windows engine-DLL `EPERM` again. Operator must stop API, run `npx prisma generate`
in `api`, restart and deploy matching UI/API. No user API process was stopped.

Automated HTTP/browser tests use real Express/auth/middleware/routes with a
transactional in-memory Prisma and isolated storage substitute. Target PostgreSQL/
concurrent-user, actual storage and physical-printer UAT are required. This does
not deliver physical cheque templates, banking integration/reconciliation feeds,
GL/Stock, retention release, multi-step routing, inbox/notifications or redesigned
financial reports. GR, Stock Issue and Stock Return have subsequently been
implemented above; full stock reporting and costing policies remain open.

### Payment vouchers (PV)

Open AP > PV (`/ap/vouchers?tab=pv`); new/view/edit use separate pages under
`/ap/vouchers/pv/`. Search PV/PS/PO/contractor, filter lifecycle/payment state and
paginate 20 rows. A searchable source dropdown selects **one new approved PS at
its full net amount**. Items, supplier snapshot, VAT, WHT and retention come from
PS; forged client totals are ignored. PR/PO direct, partial/multiple sources,
multiple methods, advance payment, GL/Stock and retention release are excluded.

Draft/returned can be edited. Submit -> pending -> approved is one-step approval;
pending can be returned or rejected. Draft and returned reserve the PS; rejected
and cancelled release it. Approved means **waiting for payment**, not paid.
Permissions: `ap.view` reads/prints, `ap.create` creates/submits, `ap.update` edits,
`ap.approve` approves/returns/rejects, `ap.cancel` cancels and **`ap.pay` records
actual cash/transfer payment**. Assign the new action to the appropriate Accounting
roles. Creators cannot approve their own voucher, even admin; a separately
authorized creator/approver may record payment. Return/reject/cancel need reasons.
Numbers are issued at Draft creation as `PVYYMMXXXX`, Gregorian year/month,
monthly atomic sequence; cancelled/rejected numbers are never reused.

Cash needs the actual date and recipient. Transfer additionally needs payer/payee
bank accounts, payment reference and a `pv-payment` attachment. Payment dates must
not precede PV/PS dates. Before submitting a PS with WHT, enter individual/company
taxpayer type and a tax description/reference. No 50 Tawi or PND3/53 is generated.
These actions **record a transaction performed outside the system**; they do not
send bank transfers. Approval/payment freezes document/payment evidence.

Cancellation after payment is an explicit manual reversal, requiring both
`ap.cancel` and `ap.pay`, a reason, reversal date/reference and `pv-reversal`
evidence. It preserves payment/reversal history, releases PS for a new PV, and
does not cancel PS or release its PO capacity. Reversal dates cannot precede the
payment. Unpaid cancellation needs `ap.cancel` and a reason, not reversal proof.
Evidence uses the existing upload storage, file limits and PDF/JPG/PNG restrictions:
document/payment files may be managed on Draft/returned with create or update;
payment evidence on approved/unpaid requires pay; reversal evidence on
approved/paid requires pay+cancel. Closed states are immutable.

Cheque PV cannot be manually paid using the cash/transfer action. The CQ process
above now handles preparation/signing/release/clearance/reversal: release records
PV paid; clearance records a separate bank date. Active cheques block direct PV
cancellation; follow the CQ link for evidence and reversal. Legacy PV/linked
cheque mutations remain blocked for reconciliation.

Printing adapts the supplied PV reference to blank A4: journal/detail/debit-credit
grid, bank/payment table and five blank signature boxes, with eight source lines
per page and final totals on the last page. Account/department/project codes stay
blank; debit/credit is a PS allocation summary, **not GL posting**. Draft/cancelled/
reversed/payment state markings are retained. Long text is fitted within a minimum
font size; unfit content explicitly blocks printing instead of truncating.

**Rollout:** Review/backup and apply
[`accounting-payment-vouchers.sql`](../api/scripts/sql/accounting-payment-vouchers.sql)
after Accounting/master/PS/attachment prerequisites. It adds lifecycle/payment/
reversal/snapshot/evidence fields and indexes, including an active-PS uniqueness
backstop; it does not change legacy amounts/status. Legacy remains version 0,
read-only, and active legacy PV still reserves PS. Reconcile/migrate separately.
No shared SQL was applied here. Prisma schema validation and production build/
types passed; client generation encountered Windows loaded-engine DLL `EPERM`.
Operator must stop the API, run `npx prisma generate` in `api`, restart and deploy
matching UI/API. Automated HTTP/browser tests use real Express/auth/routes and a
transactional in-memory Prisma substitute; PostgreSQL/concurrent-user, real
evidence-storage and physical-printer UAT remain required.

### Contractor payment requests (PS)

Open AP > PS (`/ap/vouchers?tab=ps`). New/view/edit are separate pages under
`/ap/vouchers/ps/`. The register supports PS/PO/contractor search, status filtering
and 20-row server pagination. PO selection is searchable, dates use dd/mm/yyyy,
and each request has multiple before-VAT amount lines, remarks and record history.

The agreed interim scope permits noncancelled/nonrejected Draft POs. The supplier
comes from PO, with a saved identity/address snapshot. VAT follows PO; user-entered
WHT and retention rates start at zero and apply to the before-VAT sum. Amounts are
recalculated by the API in satang, with independent before-VAT/VAT/gross PO caps.
Draft does not reserve capacity. Submit reserves it; pending/approved requests
consume capacity, and return/reject/cancel release it. Printed cumulative amounts
are snapshots at save/submit/approval, not live balances or cash paid.

Lifecycle: Draft/returned may be edited and submitted; pending may be approved,
returned or rejected. Approval is one step, with no amount/type routing in this
phase. `ap.view` reads, `ap.create` creates/submits, `ap.update` edits,
`ap.approve` approves/returns/rejects and `ap.cancel` cancels. Admins must assign the
new permissions to Accounting roles. The creator cannot approve their own request,
including admin; use a different approver account. Return/reject/cancel require a
reason. Approved records are immutable. PS uses a new `PSYYMMXXX-Rround` number
per document at Draft creation; PO+round is unique even after rejection/cancellation.

PO edits are blocked while pending/approved PS exists. All PS mutations, round
checks, reservations and audit writes share transactions and PO row locks, with
revision checks and create request-key deduplication. PV creation now follows the
approved full-PS lifecycle above; PS cancellation is blocked by any referencing
PV except cancelled/rejected under the shared lock order. Payment/reversal does
not independently release PS's PO reservation.

PS prints on blank A4 paper, eight lines per page with totals on the final page,
status markings and blank signature boxes. Overflow blocks printing and asks for
shorter text. No PS-specific reference PDF was supplied; this is the agreed plain
paper layout, not a claim of matching an existing PS form. No cash, GL or Stock
posting, retention release, email/inbox, multi-step approval or FX is included.

**Rollout:** Review/backup and run
[`accounting-contractor-payments.sql`](../api/scripts/sql/accounting-contractor-payments.sql)
after the prior Accounting/master scripts. It adds fields/indexes without changing
legacy amounts/status. Duplicate existing PO/round pairs abort the script for
manual reconciliation. Existing PS remains lifecycleVersion=0/read-only; unresolved
noncancelled/nonrejected Legacy PS blocks new requests on that PO. Do not relabel
legacy rows as version 1 without a separate audited data migration.
Stop API, run `npx prisma generate` in `api`, restart and deploy UI together.
Generation here encountered the Windows DLL lock (`EPERM`); no user process was
stopped and no shared SQL was applied. Real PostgreSQL/concurrent-user and physical
printer UAT are still required. Automated browser tests used the real Express
routes/auth with a transactional in-memory Prisma substitute.

### Accounting master data (six groups)

Customer, Accounting Sale, Supplier/Contractor, Product/Service, Warehouse and
Chart of Accounts now have full-page new/detail/edit routes. Their registers
support search, active status filtering, 20-row pagination and CSV export of all
filtered records (not just the visible page). Products additionally filter by
type, suppliers by supplier type, and accounts by category.

Customer branches/addresses and primary/secondary Accounting Sales are preserved.
Suppliers support multiple branches with contact/billing addresses and multiple
bank accounts per branch; select exactly one default branch and one default bank
when a branch has banks. Existing scalar supplier fields remain compatible and
mirror the selected default address/bank. PO defaults use the selected branch;
saved PO printing uses a supplier identity snapshot rather than the live master.

Codes/names are required and codes unique. Domestic Tax ID is optional but must
be 13 digits if entered; duplicates warn without blocking. Overseas supplier IDs
are not restricted to 13 digits. Prices/costs are nonnegative two-decimal values,
credit days are nonnegative integers, and emails support comma-separated entries.
Editing a referenced product cannot change its stored/manufactured/service type.
Warehouse description/location and account header/detail/mapping are editable.
These actions do not post GL or change Stock quantities/valuation.

Existing `master.view/create/update/delete` permissions apply. Record history
shows transactional before/after values, actor and time, with pagination. Old
records without audit entries are labelled as such. Permanent deletion requires
confirmation and is rejected when references exist; use inactive status instead.
Master lookups exclude inactive entries; new document writes also validate their
master references. Historical documents remain readable. Invoice-based BI/RV/CN
retain the agreed snapshot/debt settlement rules rather than re-reading customer
master identity. CSV contains nested branch/address/bank objects as JSON cells,
has a UTF-8 BOM, quoted fields and spreadsheet formula protection. Export/history
use the existing Master view permission, not a new per-field or export permission.

**Rollout:** Back up/review and apply
[`accounting-master-data.sql`](../api/scripts/sql/accounting-master-data.sql) after
the existing Accounting tables/scripts. It seeds missing supplier branches/banks
from scalar data and fills only missing PO snapshots with currently available
identity; it cannot recover earlier identity edits. No balance/status changes.
Stop the API, run `npx prisma generate` in `api`, restart it, and deploy this UI
together. Generation in this session encountered Windows `EPERM` on a loaded
engine DLL; no unrelated/user API process was stopped. Schema validation passed,
but target DB rollout and real-data/concurrency UAT remain pending.

Not included: sublocations, opening balances, stock transfers/thresholds/valuation,
GL/journals/period closing, Accounting approvals, notification delivery or advanced
business reports. API tests use transactional Prisma substitutes; browser checks
exercise the real Express routes/validators, not a target PostgreSQL database.

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