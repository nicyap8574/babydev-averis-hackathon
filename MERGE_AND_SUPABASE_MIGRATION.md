# Merge + Supabase consolidation — summary for the team

Branch: `260919-merge-nic-yewren-code`

Two people built genuinely different things on separate branches:

- **nic's branch** — the full review dashboard (`frontend/`) plus a FastAPI backend
  (`backend.py`) and an NVIDIA-based classifier in `pipeline.py`.
- **yewren's branch** — a standalone "classifier lab" app plus a real Supabase backend
  (Postgres + an Edge Function) with its own deterministic-rules + OpenRouter classifier.

This document explains how the two got combined into one app, backed by Supabase, with a
combined NVIDIA→OpenRouter→rules classification cascade — and exactly what was kept, added, and
removed along the way.

---

## What was taken from nic's code

- **`frontend/`** — kept as the base app. All of its views survive unchanged: dashboard,
  inbox (search/filter/pagination), review queue (with a resolve workflow), the case comparison
  modal (side-by-side SI/BL field diff), and the reports/analytics/settings placeholders.
- **The design system** — `mockup.css` (the "LADING" brand: dark-green sidebar, sage canvas,
  status colors, `Inter` font) is the visual system the whole consolidated app now uses,
  including the ported-in classifier lab tab.
- **`pipeline.py`'s NVIDIA classifier** (`LLMClassifier`) — kept as the first stage of the new
  classification cascade (see below).
- **`backend.py`'s field-comparison logic** — not the file itself (retired, see "Removed"), but
  its exact logic for building the SI/BL per-field comparison table was ported into `pipeline.py`
  as `field_comparison_rows()`.

## What was taken from yewren's code

- **Supabase itself** — the Postgres schema (`inbox_records`, `classification_decisions`,
  `classification_runs`) and the `identify-document-request` Edge Function (Deno/TS) are
  untouched and still running exactly as built.
- **The classifier lab feature** — the sample picker, editable email form, and decision-result
  panel (category, `continue_to_extraction`, decision path, cache status, intent hash, raw model
  output) — ported into `frontend/` as a new **Classifier Lab** tab, restyled onto nic's design
  system instead of its own separate look.
- **The OpenRouter integration pattern** — model choice (`google/gemini-2.0-flash-001`), the
  JSON-schema-constrained prompt design, and the deterministic-rules-first classifier
  (`supabase/functions/_shared/document-classifier.ts`) — all kept as-is for the Edge Function,
  and used as the second opinion in `pipeline.py`'s new cascade.
- **Test suite** — `tests/document-classifier.test.ts` (11 tests) and
  `scripts/evaluate-classifier.mjs` (rule-coverage evaluation) — kept running unchanged.

---

## What was added, and why

| Added | Why |
|---|---|
| **OpenRouter stage in `pipeline.py`'s classifier** (`_request_label_openrouter`) | You asked for NVIDIA → OpenRouter → keyword-rules as one cascade. Capped at 40 calls/run and hard-stops on the first HTTP 429 — a prior local test showed the free tier (20 req/min, 50/day) gets exhausted almost immediately if called for every email. |
| **`supabase_sync.py`** | Pushes every pipeline run's results (classification + comparison + per-field detail) into Supabase, so Postgres becomes the real data source instead of flat JSON files. |
| **`field_comparison_rows()` in `pipeline.py`** | The SI/BL field-by-field comparison used to be computed live by `backend.py` on every request. Moved to run once per pipeline run instead, so it can be stored in Supabase and the UI never needs a Python server at view time. |
| **`frontend/public/case-data.json` snapshot** | With `backend.py` gone, this is what keeps the dashboard working with **zero external services** — `pipeline.py` writes it, and the frontend reads it automatically when Supabase isn't configured. |
| **New Supabase migration** (`202609200001_pipeline_submissions.sql`) | Extends the existing schema with the columns/tables pipeline data needs, plus RLS policies (see Security below) — without touching yewren's original tables' constraints. |
| **Classifier Lab tab in `frontend/`** (`ClassifierLabView.tsx`) | Consolidates the two apps into one UI, per your request — same feature, new home. |
| **`frontend/src/api.ts` rewritten to call Supabase directly** | Retires `backend.py` while keeping every dashboard component's code unchanged — the exported function names/types (`fetchEmails`, `fetchEmailDetail`, etc.) are identical, only what's behind them changed. |
| **`frontend/src/lib/categories.ts`** | Python's categories (`BL_COMPARISON`) and Supabase's (`comparison_request`) use different naming; this translates between them (mirrors an existing translation already used elsewhere in the codebase). |

## What was removed, and why

| Removed | Why |
|---|---|
| **`sdoc-hackathon-bundle/backend.py`** | Its only remaining job (live field comparison) moved into `pipeline.py`. With that gone, the FastAPI server was pure middleman between the UI and Supabase — removing it means one less process to run. |
| **The standalone classifier-lab app** (`src/App.tsx`, `main.tsx`, `styles.css`, `index.html`, `vite.config.ts`, `public/prototype.html`, `mockup-preview.png`) | Its functionality now lives inside `frontend/` as a tab. Keeping the old copy would just be dead code duplicating the same feature. |
| **Root `package.json`'s app scripts/deps** (`dev`, `build`, `preview`, `react`, `react-dom`, `vite`, `@vitejs/plugin-react`) | Nothing left at the repo root to build or serve — only the classifier logic's tests/scripts remain there. |
| **The second dev-server port (5174)** | Only one frontend app exists now, so the port-collision workaround from an earlier step is no longer needed. |

**Nothing was removed that changes user-facing capability** — every view, the resolve workflow,
and the classifier lab's behavior (including its own "local rules mode" when Supabase isn't
configured) all still work, verified end-to-end with a real headless browser.

---

## Current implementation stack

- **Frontend:** React 19 + Vite + TypeScript — **one app**, `frontend/`, port 5173.
- **Backend:** none running persistently. `pipeline.py` (Python) is a batch/on-demand job:
  classify → compare → write `submission.json` (the scoring contract) → sync to Supabase → write
  the local fallback snapshot.
- **Database:** **Supabase (Postgres)** — `inbox_records` (classification + comparison + full
  per-field detail), `review_queue_items`, `review_resolutions`, plus yewren's original
  `classification_decisions`/`classification_runs` (Edge Function audit trail).
- **AI models — two independent classification paths:**
  - `pipeline.py`'s batch cascade: **NVIDIA** (`nvidia/nemotron-3-ultra-550b-a55b`, direct API)
    first → **OpenRouter** (`google/gemini-2.0-flash-001`) second, only on NVIDIA failure →
    deterministic keyword rules last resort.
  - The Supabase Edge Function's interactive path (Classifier Lab tab): deterministic rules
    first → **OpenRouter** (same model) only for ambiguous cases.
- **Cloud infra:** Supabase (Postgres + Edge Functions/Deno).
- **Offline fallback:** `frontend/public/case-data.json`, written by every `pipeline.py` run —
  lets the dashboard work with zero external services configured.
- **Testing:** Node's built-in test runner (classifier logic), Playwright (UI, drives the
  Classifier Lab tab), a rule-coverage evaluation script.
- **Scoring contract (external, unchanged):** `submission.json`, scored by the organizers'
  `score_cli.py` / Docker `/submit` endpoint — untouched by any of this work.

### Security note worth flagging to the team

`frontend/` now queries Postgres directly with the **anon/publishable key**, which Row Level
Security applies to. We added narrow, **open** (`using (true)`) policies scoped to exactly what
the dashboard needs — read `inbox_records`/`review_queue_items`, write those plus
`review_resolutions`. There's no auth or multi-tenancy anywhere in this project, so this is a
deliberate hackathon-scope tradeoff, not an oversight — flagging it so it doesn't surprise anyone
later. `classification_decisions`/`classification_runs` stay locked down (service-role key only).
