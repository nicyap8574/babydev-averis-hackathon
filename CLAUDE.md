# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

An entry for the **SDOC hackathon** ("Shipping document verification"): given an inbox of
shipping-related emails, classify each one and, for comparison emails, check the attached
Shipping Instruction (SI) against the draft Bill of Lading (BL) for mismatches. The repo has
three parts that don't share code (no shared package/imports between them):

- `sdoc-hackathon-docker/` — **the organizers' kit** (dataset generator, FastAPI scoring
  server, Docker distribution). Treat this as upstream/reference material, not something to
  redesign — it defines the contract (schema, scoring formula, endpoints) everything else
  must satisfy.
- `sdoc-hackathon-bundle/` — **the participant solution**: `pipeline.py` (classify + compare),
  `backend.py` (a FastAPI review UI backend), and the static inbox data used for local dev.
  This is where solution work happens.
- `index.html` (repo root) — a static, self-contained HTML/CSS/JS mockup of the review UI
  ("LADING — Document verification"). It currently renders from data hard-coded in its
  `<script>` block, not from `backend.py`'s API — wiring it up is unfinished work, not a bug.
- `frontend/` — a React + Vite + TypeScript app (see `hackathon-solution-plan.md`'s frontend
  requirements) intended to become the real review UI, superseding the `index.html` mockup.
  Not yet wired to `backend.py`.

## Core principle — the model never decides

The AI reads; code decides. Every value the model/pipeline extracts must be traceable to an
exact substring in the source document — if a value can't be verified against the source text,
it's dropped and the field is escalated to human review (`NEEDS_REVIEW`) rather than reported
as fact. **Comparison itself (match / mismatch / formatting variant) is always deterministic
code, never a model call.** This is what keeps the system explainable and free of hallucinated
discrepancies — hold this line even under time pressure. See `hackathon-solution-plan.md` for
the full rationale and per-field comparison rules (normalize-before-compare for names/ports,
exact match for container count, unit-converted with rounding-only tolerance for weight).

## Tech stack (target, per `hackathon-solution-plan.md`)

- **Frontend:** React (`frontend/`), replacing the static `index.html` mockup.
- **AI model:** `nvidia/nemotron-3-ultra-550b-a55b:free` via OpenRouter — text-only, no vision;
  scanned/image-only attachments need an OCR pass (Tesseract.js) before reaching the model.
  Free-tier rate limits: 20 req/min, 50 req/day until $10 of OpenRouter credit has ever been
  purchased, then 1,000/day.
- **Database:** not yet decided — needs one case record per email, extracted field values with
  source spans, comparison verdicts, an append-only audit log, and review-queue state. Leaning
  relational given the fixed 7-field SI/BL shape and cross-field audit queries.
- **Cloud infrastructure:** not yet decided — needs managed storage for attachments/evidence,
  on-demand compute for pipeline steps, and a way to push live case status to the frontend
  (realtime or polling).

## Open decisions to track

- [ ] Database product (relational leaning, not committed).
- [ ] Cloud/hosting provider for compute + storage + realtime updates.
- [ ] Confirm Tesseract.js is sufficient for the OCR path, or pick a fallback.

## Commands

Run everything from `sdoc-hackathon-bundle/` unless noted.

```bash
# Run the pipeline against the local bundle data, writing submission.json
python pipeline.py
# or: python pipeline.py <data-dir> <output.json>

# Run the review-queue backend (serves submission.json + review_queue.json)
uvicorn backend:app --reload --port 8000

# Score a submission (from the organizers' kit, needs ground_truth.json which
# participants do NOT have — organizers run this, or use the Docker /submit endpoint)
cd ../sdoc-hackathon-docker/server && python3 score_cli.py path/to/submission.json
python3 score_cli.py submission.json --json   # machine-readable

# Bring up the full dataset + scoring server (from sdoc-hackathon-docker/)
docker compose up --build      # serves on http://localhost:8080
```

There is no test suite, linter, or build step configured in this repo.

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
   deterministic path (spam words → SI-request subject patterns → comparison subject/coded
   patterns or `_si`+`_bl` attachment pairing → invoice terms → default `GENERAL`).
   `LLMClassifier` optionally calls an NVIDIA-hosted model (`NVIDIA_API_KEY` env var) with an
   on-disk cache (`llm_cache.json`) and falls back to `classify_keywords` on any failure,
   logging the reason to `llm_fallbacks.log`. Order of the keyword checks matters — e.g.
   SI-request patterns are checked before invoice terms because SI emails often list invoice
   numbers too.
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

### `loader.py` — dual-mode data access (duplicated in both kits)

`Inbox(source)` abstracts a local bundle directory vs. an HTTP server behind one API
(`emails()`, `get(id)`, `read_bytes/read_text(attachment_path)`, `submit(dict)`). Participants
never see ground truth locally or over HTTP; scoring happens server-side (`/submit`) or via
`score_cli.py` run by someone holding `ground_truth.json`.

### `backend.py` — review UI API (separate from the scoring server)

A small FastAPI app that does **not** re-run the pipeline — it loads the already-produced
`submission.json` on startup, joins it against the inbox emails, and serves a review queue
(`/emails`, `/emails/{id}`, `/review-queue`, `POST /review-queue/{id}/resolve`) for a human to
work through `NEEDS_REVIEW` cases. `review_queue.json` persists queue state across restarts if
present, otherwise it's rebuilt from `submission.json`'s `NEEDS_REVIEW` entries.
`review_resolutions.json` accumulates resolution history (append-only). It expects a frontend
dev server on `http://localhost:5173` (CORS-allowed) — none exists in this repo yet.

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
