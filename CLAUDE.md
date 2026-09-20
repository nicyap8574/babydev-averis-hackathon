# Repository guidance

## Current application

DocWise is a React/Vite workspace in `frontend/`. It reads real case, review, and comparison rows from Supabase. There is no static case snapshot or local mock-data fallback. If the frontend Supabase settings are missing, it shows a setup error.

The frontend uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never expose the Supabase service-role key or model API keys in browser variables.

New Case stores email details in `inbox_records`, uploads attachments to the private `case-attachments` Storage bucket, then invokes `supabase/functions/identify-document-request/`. The app is a single shared workspace without sign-in; its current RLS policies allow public workspace reads and intake. The function accepts public-key calls and uses server-side credentials for privileged writes.

The Edge Function runs deterministic email-intent rules, then the Groq → NVIDIA → Cerebras model cascade for ambiguous messages. Function secrets are `GROQ_API_KEY`, `NVIDIA_API_KEY`, and `CEREBRAS_API_KEY`; Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

SI/BL extraction and comparison currently run in the local batch pipeline under `sdoc-hackathon-bundle/pipeline.py`, then `supabase_sync.py` syncs completed rows. The browser intake does not yet invoke a hosted SI/BL processing service, so new comparison cases remain pending until that service is connected. Do not show a comparison verdict without persisted comparison output.

## Main paths

- `frontend/src/api.ts`: Supabase reads, case creation, and review resolution.
- `frontend/src/components/`: workspace screens and case flows.
- `supabase/functions/_shared/document-classifier.ts`: deterministic email-intent classifier and decision cache.
- `supabase/functions/identify-document-request/`: Edge Function and provider clients.
- `supabase/migrations/`: schema, shared intake/storage policies, provider audit methods.
- `sdoc-hackathon-bundle/pipeline.py`: batch attachment extraction and deterministic SI/BL comparison.
- `sdoc-hackathon-bundle/supabase_sync.py`: batch result persistence.
- `tests/document-classifier.test.ts`: Node test suite for shared classifier behavior.

## Commands

```sh
cd frontend
npm run dev
npm run build
```

```sh
# From the repository root
npm test
```

```sh
# From sdoc-hackathon-bundle/
python -m unittest test_pipeline -v
python pipeline.py
```

Apply pending Supabase migrations and deploy the Edge Function after setting the project’s function secrets. Vercel deployments also require the two frontend variables above.
