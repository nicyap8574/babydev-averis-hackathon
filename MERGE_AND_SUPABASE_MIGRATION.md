# Supabase and application architecture

## Current flow

- `frontend/` is the single React review application. It reads the shared workspace from Supabase; no static case data or local mock fallback is shipped.
- New Case inserts a shared `inbox_records` row, uploads files into the private `case-attachments` bucket, then invokes the `identify-document-request` Edge Function.
- The Edge Function applies deterministic email-intent rules. Ambiguous messages use Groq, then NVIDIA, then Cerebras. It stores classification decisions and audit runs in Postgres.
- The batch pipeline in `sdoc-hackathon-bundle/pipeline.py` extracts SI/BL fields and compares them deterministically, then `supabase_sync.py` persists results.
- The current New Case intake does not invoke a hosted SI/BL extraction/comparison processor. Newly submitted comparisons remain pending until that processor is connected; existing batch results continue to display their persisted verdicts.

## Supabase setup

Apply the ordered migrations under `supabase/migrations/` and deploy `supabase/functions/identify-document-request/` to the existing project. Configure the Edge Function secrets `GROQ_API_KEY`, `NVIDIA_API_KEY`, and/or `CEREBRAS_API_KEY`. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function.

Configure the Vercel frontend with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never put service-role or model keys in browser variables.

## Shared workspace access

This application has no sign-in or tenant separation. Public RLS policies allow anyone who can reach the app to read shared case data, create case rows, upload shared attachments, and resolve review items. The classifier function accepts public-key calls and uses server-side credentials for privileged writes. Use this only for the agreed single-workspace deployment. `classification_decisions` and `classification_runs` remain server-only.

## User workflow

Open Overview or Inbox to find cases. Use New Case to enter sender, subject, message, and optional documents. Review existing completed comparisons in their case detail. Use Review queue to record and resolve human decisions. See `frontend/README.md` for the end-user steps and current processing limits.
