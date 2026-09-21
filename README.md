# DocWise

DocWise is a shared workspace for classifying shipping emails and comparing Shipping Instructions (SI) with draft Bills of Lading (BL).

## What it does

- Stores submitted cases and attachments in Supabase.
- Classifies email intent through the `identify-document-request` Supabase Edge Function.
- Compares SI/BL attachments deterministically across seven shipping fields.
- Shows comparison results, mismatches, review items, and a searchable archive of completed discrepancy reports in the React dashboard.
- Lets users preview or download case attachments from the case details view.

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

### Run the comparison API locally

The comparison API is a Python endpoint, so install its dependencies from the repository root before starting it:

```powershell
python -m pip install -r requirements.txt
cd frontend
```

Set the server-only Supabase values as plain strings (without Markdown brackets). The service-role key must use the exact `SUPABASE_SERVICE_ROLE_KEY` name:

```powershell
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
python -c "from http.server import HTTPServer; from api.compare import handler; HTTPServer(('127.0.0.1', 3001), handler).serve_forever()"
```

Never commit these values or put the service-role key in `.env.local`; it is privileged and must stay server-only. If a key is exposed, revoke and regenerate it in Supabase immediately.

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

## Technical Architecture

DocWise is split into three cooperating layers:

- **Frontend (`frontend/`):** A React/Vite dashboard that reads case, review, and comparison rows directly from Supabase. New Case submissions write to `inbox_records`, upload attachments to the private `case-attachments` Storage bucket, and invoke the `identify-document-request` Edge Function. There is no local mock-data fallback; if Supabase configuration is missing, the app shows a setup error instead of stale or fake data.
- **Supabase backend (`supabase/`):** Postgres holds `inbox_records`, `review_queue_items`, `review_resolutions`, and `verification_reports`, with RLS policies that currently allow public workspace reads and intake (there is no per-user auth yet). The `identify-document-request` Edge Function classifies email intent using deterministic rules first, then falls back to a Groq → NVIDIA → Cerebras model cascade for ambiguous messages. The function accepts public-key calls from the browser but uses server-side credentials (`SUPABASE_SERVICE_ROLE_KEY`) for privileged writes.
- **Document comparison (`frontend/api/compare.py` and `sdoc-hackathon-bundle/`):** SI/BL attachment extraction and field-by-field comparison run deterministically across seven shipping fields. The hosted Vercel endpoint (`frontend/api/compare.py`) supports PDF, DOCX, XLSX, TXT, and CSV uploads. A standalone batch pipeline (`sdoc-hackathon-bundle/pipeline.py`) can also process attachments offline, with `supabase_sync.py` syncing completed rows back into Supabase.

## Implementation Details

- **Deterministic-first classification:** `supabase/functions/_shared/document-classifier.ts` applies rule-based email-intent detection before calling any AI provider, keeping common cases fast, free, and reproducible. AI models are only invoked for genuinely ambiguous messages, and a decision cache avoids redundant calls.
- **Seven-field SI/BL comparison:** The comparison logic checks a fixed set of shipping fields between the Shipping Instruction and draft Bill of Lading, producing `OK`, `MISMATCH`, or `NEEDS_REVIEW` verdicts. A comparison verdict is only shown once persisted comparison output exists for a case; pending cases are never given a fabricated result.
- **Reports archive:** Completed discrepancy cases (`MISMATCH` outcomes and resolved `NEEDS_REVIEW` escalations) are captured as immutable snapshots in `verification_reports`, so a later pipeline re-run or document edit cannot silently change what a reviewer already signed off on.
- **Batch and ZIP intake:** Users can upload a ZIP of case documents through `BatchUploadModal`/`batchBundle.ts`/`batchIngest.ts`, which unpacks and archives attachments alongside the existing single-case intake flow.
- **Attachment handling:** `frontend/src/lib/attachments.ts` and `AttachmentPreviewModal.tsx` let users preview or download case attachments straight from the case details view without leaving the dashboard.
- **Secrets separation:** Browser-exposed configuration is limited to `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Model provider keys (`GROQ_API_KEY`, `NVIDIA_API_KEY`, `CEREBRAS_API_KEY`) and `SUPABASE_SERVICE_ROLE_KEY` are configured only as server-side/Edge Function secrets.

## Challenges Faced

- **No-auth shared workspace:** Because DocWise ships without sign-in for the hackathon timeline, RLS policies had to be scoped carefully to allow public workspace reads and intake without exposing privileged operations (report writes, service-role actions) to the browser.
- **Keeping AI usage deterministic where possible:** Relying on an LLM cascade for every email would be slower, costlier, and less reproducible, so a deterministic rules-first classifier had to be built and proven correct before the Groq → NVIDIA → Cerebras fallback was added only for genuinely ambiguous cases.
- **Avoiding false comparison verdicts:** The local batch pipeline (`sdoc-hackathon-bundle/pipeline.py`) and the hosted `frontend/api/compare.py` endpoint evolved separately, so care was needed to ensure a case never displays a comparison verdict unless real, persisted comparison output backs it — new cases correctly stay `pending` until that output exists.
- **Immutable report snapshots:** Reports needed to reflect the state of a case at the moment it was completed, even if the underlying documents or pipeline output changed later, which required snapshotting comparison data rather than always joining live rows.
- **Cross-format document extraction:** Supporting PDF, DOCX, XLSX, TXT, and CSV attachments in the same comparison pipeline required normalizing very different document structures into the same seven-field comparison model.

## Future Roadmap

- **Authentication and per-user access:** Add Supabase Authentication with row-level, user-based access policies so cases and attachments are no longer readable/writable by anyone with the deployed URL.
- **Hosted SI/BL processing service:** Connect browser intake directly to a hosted SI/BL extraction/comparison service so new cases no longer depend on the local batch pipeline before a comparison verdict can appear.
- **Reviewer identity:** Once authentication exists, extend `review_resolutions` with a real `reviewer_id`/display name instead of the current generic "Human reviewer" label.
- **Report versioning:** Support explicit, versioned report amendments for cases where the underlying documents change after a report is completed, rather than only immutable single snapshots.
- **Broader verification coverage:** Consider archiving clean (`OK`) verifications alongside discrepancy reports if reviewers need a full audit trail, not just mismatches and resolved escalations.
