# GreenDii Accounting UI

Separate Next.js frontend for Accounting. It uses the existing GreenDii API, database, users, and authentication tokens.

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

## Checks

```powershell
npm run lint
npm run build
```