# DocWise

DocWise is a shared workspace for classifying shipping emails and comparing Shipping Instructions (SI) with draft Bills of Lading (BL).

## What it does

- Stores submitted cases and attachments in Supabase.
- Classifies email intent through the `identify-document-request` Supabase Edge Function.
- Compares SI/BL attachments deterministically across seven shipping fields.
- Shows comparison results, mismatches, and review items in the React dashboard.

## Run locally

```powershell
cd frontend
npm install
npm run dev
```

Create `frontend/.env.local` with the public Supabase values:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

## Production configuration

Vercel needs these Production variables:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Public browser connection to Supabase. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser key. |
| `SUPABASE_URL` | Server-only connection for document comparison. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key that reads private attachments and writes verdicts. |

The SI/BL comparison endpoint is `frontend/api/compare.py`. It supports PDF, DOCX, XLSX, TXT, and CSV uploads.

## Checks

```powershell
npm test
cd frontend; npm run build
```

See [frontend/README.md](frontend/README.md) for the end-user workflow and Supabase setup details.
