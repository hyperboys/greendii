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
  existing sessions. The UI rechecks access on navigation and window focus, hides
  unavailable menus, and disables create actions for viewers. Dashboard access is
  included with any assigned role; its current content is a static placeholder.
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