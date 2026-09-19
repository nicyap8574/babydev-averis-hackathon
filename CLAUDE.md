# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An entry for the **SDOC hackathon** ("Shipping document verification"): given an inbox of
shipping-related emails, classify each one and, for comparison emails, check the attached
Shipping Instruction (SI) against the draft Bill of Lading (BL) for mismatches. The repo has
several parts that don't share code (no shared package/imports between them):

- `sdoc-hackathon-docker/` — **the organizers' kit** (dataset generator, FastAPI scoring
  server, Docker distribution). Treat this as upstream/reference material, not something to
  redesign — it defines the contract (schema, scoring formula, endpoints) everything else
  must satisfy.
- `sdoc-hackathon-bundle/` — **the participant solution**: `pipeline.py` (classify + compare +
  precompute the SI/BL field comparison), `supabase_sync.py` (syncs pipeline results into
  Supabase), and the static inbox data used for local dev. This is where solution work happens.
- `frontend/` — **the one review UI** (React + Vite + TypeScript): dashboard, inbox, review
  queue, a classifier lab tab (testing the "identify document request" email-intent classifier
  one email at a time), reports/analytics/settings placeholders. Talks to Supabase directly
  (`frontend/src/api.ts`, `frontend/src/lib/supabase.ts`) — there is no backend process to run.
  Dev server on port 5173.
- `supabase/functions/identify-document-request/` — a Supabase Edge Function (Deno/TS) backing
  the classifier lab tab: deterministic rules first, OpenRouter (`google/gemini-2.0-flash-001`)
  second for ambiguous cases, persisted to Postgres. Separate from, and not reordered to match,
  `pipeline.py`'s own NVIDIA→OpenRouter→keywords cascade (see below) — the two exist for
  different use cases (interactive single-email testing vs. batch scoring), and
  `frontend/src/components/ClassifierLabView.tsx` calls this Edge Function directly.
- Repo root `tests/`/`scripts/` — the classifier logic's own tests
  (`tests/document-classifier.test.ts`, Node's built-in test runner) and evaluation script
  (`scripts/evaluate-classifier.mjs`), plus `tests/ui/classifier-page.spec.ts` (Playwright,
  drives `frontend/`'s Classifier Lab tab). There is no app at the repo root anymore — the
  standalone classifier-lab app that used to live at `src/`/`index.html` was folded into
  `frontend/` as a tab; only its non-UI logic (`supabase/functions/`, these tests/scripts)
  stayed at the root.

## Core principle — the model never decides

The AI reads; code decides. Every value the model/pipeline extracts must be traceable to an
exact substring in the source document — if a value can't be verified against the source text,
it's dropped and the field is escalated to human review (`NEEDS_REVIEW`) rather than reported
as fact. **Comparison itself (match / mismatch / formatting variant) is always deterministic
code, never a model call.** This is what keeps the system explainable and free of hallucinated
discrepancies — hold this line even under time pressure. See `hackathon-solution-plan.md` for
the full rationale and per-field comparison rules (normalize-before-compare for names/ports,
exact match for container count, unit-converted with rounding-only tolerance for weight).

## Tech stack

- **Frontend:** React (`frontend/`, port 5173) — one app, talking to Supabase directly. See
  "What this repo is" above.
- **AI model:** `pipeline.py`'s classification cascade is **NVIDIA direct → OpenRouter → keyword
  rules**: NVIDIA's own endpoint is tried first (`NVIDIA_API_KEY`, model
  `nvidia/nemotron-3-ultra-550b-a55b`), then OpenRouter (`OPENROUTER_API_KEY`, model
  `google/gemini-2.0-flash-001`) as a second opinion only if NVIDIA hard-fails, and only if
  *both* fail does it fall back to `classify_keywords`. This is a deliberate deviation from the
  original target of a single `nvidia/nemotron-3-ultra-550b-a55b:free` OpenRouter call — see
  `pipeline.py`'s `LLMClassifier` for the actual implementation. OpenRouter's free tier (20
  req/min, 50 req/day) is rate-limited hard enough that a prior full-dataset run without an
  NVIDIA key exhausted it almost immediately; `OPENROUTER_MAX_CALLS_PER_RUN` (default 40) and an
  immediate short-circuit on the first HTTP 429 exist specifically to prevent repeating that.
  No vision model is used anywhere — text-only; scanned/image-only attachments would need an OCR
  pass (not yet implemented) before reaching any model.
- **Database:** **Supabase (Postgres)** is the live backend for `frontend/`. `pipeline.py` keeps
  writing `submission.json` unconditionally (that's the scored contract and must never depend on
  a network service); `supabase_sync.py` then best-effort-upserts the same results — including
  the precomputed per-field SI/BL comparison (`field_comparison_rows()`) — into
  `inbox_records`/`review_queue_items`/`review_resolutions` if `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY` are set. `pipeline.py` also writes a static
  `frontend/public/case-data.json` snapshot of the same data; `frontend/src/api.ts` reads from
  Supabase when `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` are configured, else falls
  back to fetching that local file — so the dashboard still works with zero external services,
  it just won't reflect anything newer than the last `pipeline.py` run.
- **Cloud infrastructure:** Supabase (Postgres + Edge Functions) — both `frontend/` and
  `supabase/functions/identify-document-request/` depend on it directly.
- **Security note:** `frontend/` queries Postgres with the anon/publishable key, which Row Level
  Security applies to. `supabase/migrations/202609200001_pipeline_submissions.sql` adds narrow,
  open (`using (true)`) policies scoped to exactly what the dashboard needs — read
  `inbox_records`/`review_queue_items`, write `review_queue_items`/`review_resolutions`. There is
  no auth/multi-tenancy anywhere in this project; this is a deliberate hackathon-scope tradeoff,
  not an oversight. `classification_decisions`/`classification_runs` stay locked down — only the
  Edge Function (service-role key, bypasses RLS) touches them.

## Open decisions to track

- [ ] Confirm/replace `google/gemini-2.0-flash-001` as the OpenRouter model, or switch it to
      `nvidia/nemotron-3-ultra-550b-a55b:free` to match the original target model.
- [ ] OCR path for scanned/image-only attachments (Tesseract.js proposed, not implemented).
- [ ] Real auth, if this ever needs to be more than a single-reviewer hackathon demo — the open
      RLS policies above assume it isn't.

## Commands

Run everything from `sdoc-hackathon-bundle/` unless noted.

```bash
# Run the pipeline against the local bundle data, writing submission.json
# (plus a Supabase sync + frontend/public/case-data.json snapshot, both best-effort)
python pipeline.py
# or: python pipeline.py <data-dir> <output.json>
# Env vars: NVIDIA_API_KEY, OPENROUTER_API_KEY (both optional — falls back to
# classify_keywords if unset/failing), OPENROUTER_MAX_CALLS_PER_RUN (default 40),
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (optional — Supabase sync is skipped
# without them, case-data.json is still written either way)

# Score a submission (from the organizers' kit, needs ground_truth.json which
# participants do NOT have — organizers run this, or use the Docker /submit endpoint)
cd ../sdoc-hackathon-docker/server && python3 score_cli.py path/to/submission.json
python3 score_cli.py submission.json --json   # machine-readable

# Bring up the full dataset + scoring server (from sdoc-hackathon-docker/)
docker compose up --build      # serves on http://localhost:8080
```

```bash
# The review UI — port 5173. Add frontend/.env.local (see frontend/.env.example) to
# connect it to Supabase; without it, it reads frontend/public/case-data.json instead.
cd frontend && npm install && npm run dev
```

From the repo root (classifier logic tests, not the UI):

```bash
npm install
npm run test                # tests/document-classifier.test.ts (Node built-in runner)
npm run evaluate:classifier # rule-only coverage/precision against the full dataset
npx playwright test         # tests/ui/classifier-page.spec.ts, drives frontend/'s dev server
```

There is no test suite, linter, or build step configured for `sdoc-hackathon-bundle/`.

### Scoring a submission without the organizers

If a live server URL is available, `loader.Inbox("http://<host>:8080").submit(submission)`
POSTs to `/submit` and returns the scoreboard — ground truth is never exposed, only the score.

## Architecture

### The task contract (`sdoc-hackathon-bundle/README.md`, `data_v2/README.md`)

For every email, produce a record keyed by `email_id`:

```json
{ "category": "BL_COMPARISON", "status": "MISMATCH", "review_reason": null,
  "has_defect": true, "defect_fields": ["consignee"] }
```

- `category`: `BL_COMPARISON | SI_REQUEST | INVOICE_QUERY | GENERAL | SPAM`.
- For `BL_COMPARISON` only, compare 7 fields — `shipper, consignee, notify_party,
  port_of_loading, port_of_discharge, container_count, gross_weight_kg` — between the SI and
  BL attachments. `status` is `OK` (all match), `MISMATCH` (≥1 differs), or `NEEDS_REVIEW`
  (can't decide: `wrong_doc_type | missing_attachment | unreadable | missing_value`).
- SI and BL attachments label the same field differently (e.g. `Port of Loading` vs `Load
  Port`) — matching must be by meaning, not by header text. `LABELS` in `pipeline.py` is the
  synonym map.
- A blank/placeholder value (`TBA`, `???`, `___`) is *not* a mismatch — it's `NEEDS_REVIEW`
  (`missing_value`); don't conflate "can't tell" with "differs".

Scoring (`scoring.py`, mirrored by `score_cli.py`/`app.py`) is a weighted blend: 50%
end-to-end (defects routed to `BL_COMPARISON` *and* flagged with the exact `defect_fields`),
30% Stage-1 macro-F1 (classification), 20% Stage-3 defect-F1. `NEEDS_REVIEW` correctness is
reported on a separate "reliability" (escalation precision/recall) axis and doesn't affect
the main score directly.

### `sdoc-hackathon-bundle/pipeline.py` — the solution pipeline

1. **Classify** (`classify_keywords` / `LLMClassifier.classify`): keyword rules are the
   deterministic fallback path (spam words → SI-request subject patterns → comparison
   subject/coded patterns or `_si`+`_bl` attachment pairing → invoice terms → default
   `GENERAL`). Order of the keyword checks matters — e.g. SI-request patterns are checked
   before invoice terms because SI emails often list invoice numbers too. `LLMClassifier.classify`
   is a three-stage cascade: NVIDIA direct (`_request_label_nvidia`, `NVIDIA_API_KEY`) is tried
   first; only if that hard-fails does it try OpenRouter (`_request_label_openrouter`,
   `OPENROUTER_API_KEY`) as a second opinion, capped at `OPENROUTER_MAX_CALLS_PER_RUN` calls per
   run and short-circuited immediately on the first HTTP 429; only if *both* fail does it call
   `classify_keywords`. Results are cached on disk (`llm_cache.json`, keyed by `email_id`,
   recording which provider produced each label) and every fallback reason from both providers
   is logged to `llm_fallbacks.log` (`nvidia:<reason>;openrouter:<reason>`).
2. **Extract attachment text** (`attachment_text`): dispatches on file suffix — `.txt` read
   directly, `.docx`/`.xlsx` parsed by hand via `zipfile` + `xml.etree` (no external deps),
   `.pdf` via the optional `pypdf` if installed, else treated as unreadable.
3. **Extract fields** (`extract_fields`): regex-matches each field's synonym labels
   line-by-line against the attachment text.
4. **Compare** (`compare`): finds the SI/BL attachment pair by filename convention (`*_si.*`
   / `*_bl.*`), extracts both, and only after confirming both documents are the expected type
   (`"shipping instruction"` / `"bill of lading"` text present) and no required field is
   missing does it diff field-by-field (`same_value` — numeric-normalized for weight/count,
   text-normalized otherwise) to decide `OK`/`MISMATCH`/`NEEDS_REVIEW`, in that priority order
   (missing attachment → unreadable → wrong doc type → missing value → mismatch → ok).
5. `run()`/`main()` wire it together: load the `Inbox`, classify all emails in parallel (2
   workers — the free-tier LLM's rate limit), compare `BL_COMPARISON` emails, write
   `submission.json` matching `sample_submission.json`'s shape (every `email_id` present).
   `main()` then (best-effort, `submission.json` above is already written and unaffected by
   either of these failing) computes `field_comparison_rows()` per `BL_COMPARISON` email — the
   same per-field SI/BL values/match-mismatch status the review UI's case modal shows, ported
   from what used to be `backend.py`'s on-demand `/emails/{id}` logic — and uses it to both sync
   to Supabase (`supabase_sync.sync_submission`) and write `frontend/public/case-data.json` (the
   no-Supabase-configured fallback snapshot for `frontend/src/api.ts`).

### `loader.py` — dual-mode data access (duplicated in both kits)

`Inbox(source)` abstracts a local bundle directory vs. an HTTP server behind one API
(`emails()`, `get(id)`, `read_bytes/read_text(attachment_path)`, `submit(dict)`). Participants
never see ground truth locally or over HTTP; scoring happens server-side (`/submit`) or via
`score_cli.py` run by someone holding `ground_truth.json`.

### `frontend/src/api.ts` — the review UI's data layer (no backend process)

There is no server between `frontend/` and Supabase — `api.ts` queries `inbox_records`/
`review_queue_items`/`review_resolutions` directly via `@supabase/supabase-js`
(`frontend/src/lib/supabase.ts`, using the anon/publishable key — see the RLS note above), for
exactly the same four operations a prior `backend.py` FastAPI server used to provide
(`fetchEmails`, `fetchEmailDetail`, `fetchReviewQueue`, `resolveReviewItem` — these exact
exported names/types are unchanged, so every consuming component needed zero changes when
`backend.py` was retired). When `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` aren't set,
each function instead reads from `frontend/public/case-data.json` (written by `pipeline.py`,
see above); `resolveReviewItem` in that mode only mutates the in-memory copy for the rest of the
session (there's no server to persist to without Supabase). Category values are translated
between Python's `BL_COMPARISON`-style constants and Supabase's `comparison_request`-style
column values via `frontend/src/lib/categories.ts` (kept in sync by hand with
`supabase_sync.py`'s `CATEGORY_TO_SUPABASE`, the same manual-sync convention already used
between `supabase_sync.py` and `scripts/evaluate-classifier.mjs`).

### `sdoc-hackathon-docker/` — organizers' kit (reference, not solution code)

- `data_v2/generate.py` (+ `pools.py`, `shipment.py`, `render.py`, `emails.py`,
  `edgecases.py`) deterministically generates the synthetic dataset from one canonical
  shipment record per email, rendering SI/BL pairs and injecting defects at generation time so
  `ground_truth.json` can't drift from the rendered documents. `--seed` controls the draw.
- `server/app.py` is the Docker-hosted FastAPI server: serves `/emails`, `/attachments/{path}`
  (path-traversal-guarded), `/sample_submission`, and scores `POST /submit` against
  `ground_truth.json` mounted privately at `/secrets` (never served; `/ground_truth` is
  404'd unless `REVEAL_GT=1` + a matching `X-Judge-Token`).
- `server/scoring.py` is the single source of truth for the scoring formula, imported by both
  `app.py` and `score_cli.py` — if you change scoring expectations, this is the file that
  defines them (and the bundle's participants never see it).
- `server/make_bundle.py` builds the participant-facing `sdoc-hackathon-bundle/` zip from
  `data_v2/`, asserting `ground_truth.json` is excluded.

## Working across the two kits

`sdoc-hackathon-bundle/{loader.py, README.md}` are generated/copied from the organizers' kit
by `make_bundle.py` — if the task is about the dataset shape, scoring formula, or edge-case
design, check `sdoc-hackathon-docker/data_v2/README.md` and `scoring.py` first, since those
are authoritative; the bundle's copies exist only for participant convenience and must not
diverge from them.
