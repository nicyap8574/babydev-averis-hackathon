# DocWise

DocWise is a shared workspace for classifying shipping emails and comparing Shipping Instructions (SI) with draft Bills of Lading (BL).

## What it does

- Stores submitted cases and attachments in Supabase.
- Classifies email intent through the `identify-document-request` Supabase Edge Function.
- Compares SI/BL attachments deterministically across seven shipping fields.
- Shows comparison results, mismatches, and review items in the React dashboard.

## Tech stack

- **Frontend:** React, TypeScript, and Vite
- **Data and authentication platform:** Supabase (Postgres, Storage, and Edge Functions)
- **Document comparison API:** Python serverless function with pypdf
- **Document classification:** Supabase Edge Function with configurable AI providers

## Prerequisites

- Node.js 20 or later and npm
- Python 3.10 or later
- A Supabase project for local or deployed shared data

## Run locally

Install the Python dependencies used by the document-comparison API:

```powershell
python -m pip install -r requirements.txt
```

Install and run the frontend separately:

```powershell
cd frontend
npm install
npm run dev
```

`requirements.txt` contains the project's Python runtime dependencies. JavaScript and TypeScript dependencies are managed separately by the root and frontend `package.json` files and are installed with `npm install`.

Create `frontend/.env.local` with the public Supabase values:

```text
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

## Supabase setup

Apply the SQL migrations in `supabase/migrations/` to create the database schema, storage policies, and supporting functions. Then deploy the `identify-document-request` Edge Function from `supabase/functions/identify-document-request/`.

Configure at least one of these Edge Function secrets for document classification:

```text
GROQ_API_KEY
NVIDIA_API_KEY
CEREBRAS_API_KEY
```

Do not put model-provider keys or the Supabase service-role key in any `VITE_` variable; `VITE_` values are exposed to the browser.

## Production configuration

Vercel needs these Production variables:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Public browser connection to Supabase. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser key. |
| `SUPABASE_URL` | Server-only connection for document comparison. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key that reads private attachments and writes verdicts. |

The SI/BL comparison endpoint is `frontend/api/compare.py`. It supports PDF, DOCX, XLSX, TXT, and CSV uploads. Vercel installs the Python packages in the root `requirements.txt` when deploying this endpoint.

## Checks

```powershell
npm test
cd frontend; npm run build
```

See [frontend/README.md](frontend/README.md) for the end-user workflow and Supabase setup details.

## Project structure

```text
frontend/                    React dashboard and Vercel API function
supabase/migrations/         Shared workspace database and storage schema
supabase/functions/          Document-classification Edge Function
sdoc-hackathon-bundle/       Standalone hackathon pipeline bundle
sdoc-hackathon-docker/       Docker-based inbox and scoring server
requirements.txt             Python dependencies for document comparison
```

## Access and security

The current workspace has no user sign-in. Anyone who can access the deployed application can create cases and view the shared case files. Add Supabase Authentication and user-based access policies before using DocWise for sensitive or production data.
