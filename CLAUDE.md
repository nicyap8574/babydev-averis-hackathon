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
  `pipeline.py`'s own Groq→NVIDIA→Cerebras→OpenRouter→keywords cascade (see below) — the two exist for
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
- **AI model:** `pipeline.py`'s classification cascade is **Groq (GPT-OSS 120B, then Llama 3.3
  70B, then Qwen3.8-27B) → NVIDIA direct → Cerebras (Qwen3-32B) → OpenRouter → keyword rules**.
  This order is evidence-based, from a live head-to-head test of all providers against this
  dataset's hardest/most-ambiguous emails: both Groq models tested had zero failures and the
  best accuracy (94%), so Groq leads; NVIDIA was accurate when it answered but failed ~31% of
  the time (mostly rate limits), so it sits after Groq rather than first. Groq is called
  **directly against its own API** (`api.groq.com`, not proxied through OpenRouter —
  `GROQ_API_KEY`); NVIDIA's own endpoint (`NVIDIA_API_KEY`, model
  `nvidia/nemotron-3-ultra-550b-a55b`) is tried after all three Groq models fail; Cerebras is
  called **directly against its own API** (`api.cerebras.ai`, OpenAI-compatible, not proxied
  through OpenRouter — `CEREBRAS_API_KEY`, model `qwen-3-32b`, chosen for its free-tier rate
  bracket and for model-family diversity from the rest of the cascade); only if NVIDIA, Groq,
  and Cerebras all fail does it try OpenRouter (`OPENROUTER_API_KEY`, model
  `google/gemini-2.0-flash-001`) as a last LLM opinion; only if *all six* fail does it fall back
  to `classify_keywords`. Groq's own free tier gives each model a separate rate-limit bucket (30
  RPM / 1,000 RPD / 8,000 TPM) independent of OpenRouter's — see `pipeline.py`'s `LLMClassifier`
  for the actual implementation. Two Gemini models (Google AI Studio direct,
  `GOOGLE_AI_STUDIO_API_KEY`) were tried in this slot previously and were removed after the same
  head-to-head test: `gemini-3.6-flash` rate-limited almost immediately even at conservative
  pacing (most calls never landed), and `gemini-3.5-flash-lite` had the *worst* accuracy of any
  provider tested (69%) while never hard-failing — the worst combination for a fallback chain,
  since a model that always "succeeds" but is often wrong silently wins the cascade instead of
  letting a more reliable tier take over. Several things learned from live testing (against real
  API keys, not just docs) that the code works around: Groq's Cloudflare front end 403s (`error
  code: 1010`) requests with no/default `User-Agent`, which is what Python's `urllib` sends
  unless overridden; `openai/gpt-oss-120b` sometimes wraps its answer as `{"label": "..."}`
  instead of the bare JSON string the prompt asks for (the Cerebras parser accepts both shapes
  too, defensively, in case its models do the same). OpenRouter's free tier (20 req/min, 50
  req/day) is rate-limited hard enough that a prior full-dataset run without an NVIDIA key
  exhausted it almost immediately; `OPENROUTER_MAX_CALLS_PER_RUN` (default 40) and an immediate
  short-circuit on the first HTTP 429 exist specifically to prevent repeating that (Groq and
  Cerebras have their own analogous `GROQ_MAX_CALLS_PER_RUN` (default 200) and
  `CEREBRAS_MAX_CALLS_PER_RUN` (default 200); Cerebras's pacing is a conservative default, not a
  confirmed limit — verify current free-tier RPM/RPD on cloud.cerebras.ai before relying on it
  for a large run). No vision model is used anywhere — text-only; scanned/image-only attachments
  would need an OCR pass (not yet implemented) before reaching any model.
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
# Env vars: GROQ_API_KEY, NVIDIA_API_KEY, CEREBRAS_API_KEY, OPENROUTER_API_KEY
# (all optional — falls back to classify_keywords if unset/failing),
# GROQ_MAX_CALLS_PER_RUN (default 200), CEREBRAS_MAX_CALLS_PER_RUN (default 200),
# OPENROUTER_MAX_CALLS_PER_RUN (default 40),
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
   before invoice terms because SI emails often list invoice numbers too. SI-request detection
   also scans the message body (`SI_REQUEST_BODY_RE`) for an explicit "please/kindly submit ...
   SI" phrase, since some templated reminder emails carry the real signal only in the body while
   reusing an unrelated subject line (a billing notice, a vessel update, an HR time-off request);
   the other categories remain subject-only since no equivalent body-only gap has been found for
   them. `LLMClassifier.classify`
   is a six-stage cascade: Groq (`_request_label_groq`, `GROQ_API_KEY`) is tried first — called
   directly against `api.groq.com`, not proxied through OpenRouter — first `openai/gpt-oss-120b`
   then `llama-3.3-70b-versatile` then `qwen/qwen3.8-27b`, each capped at
   `GROQ_MAX_CALLS_PER_RUN` calls per run (separately, since each model has its own rate-limit
   bucket) and short-circuited on the first HTTP 429 for that model; only if all three Groq
   models hard-fail does it try NVIDIA direct (`_request_label_nvidia`, `NVIDIA_API_KEY`, model
   `nvidia/nemotron-3-ultra-550b-a55b`); only if NVIDIA also fails does it try Cerebras
   (`_request_label_cerebras`, `CEREBRAS_API_KEY`) — called directly against `api.cerebras.ai`,
   not proxied through OpenRouter — model `qwen-3-32b`, capped at `CEREBRAS_MAX_CALLS_PER_RUN`
   calls per run and short-circuited the same way; only if NVIDIA and Cerebras both fail does it
   try OpenRouter (`_request_label_openrouter`, `OPENROUTER_API_KEY`) as a last opinion, capped
   at `OPENROUTER_MAX_CALLS_PER_RUN` calls per run and short-circuited immediately on the first
   HTTP 429; only if *all six* fail does it call `classify_keywords`. Results are cached on disk
   (`llm_cache.json`, keyed by `email_id`, recording which provider produced each label —
   `groq_gpt_oss_120b`, `groq_llama_70b`, `groq_qwen_27b`, `nvidia`, `cerebras_qwen_32b`, or
   `openrouter`) and every fallback reason from all six providers is logged to
   `llm_fallbacks.log`
   (`groq_gpt_oss_120b:<reason>;groq_llama_70b:<reason>;groq_qwen_27b:<reason>;nvidia:<reason>;cerebras_qwen_32b:<reason>;openrouter:<reason>`).
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
