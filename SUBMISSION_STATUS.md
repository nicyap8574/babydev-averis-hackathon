# Submission status — Averis × Monash Hackathon 2026

**Project:** SDOC — shipping document verification (inbox → discrepancy report)
**Round:** Preliminary · **Deadline:** 22 Sept 2026, 12:00 p.m.
**Last verified:** 20 Sept 2026

Two sources define "required" here, and they are not the same thing:

- **Rules & Regulations** — what the submission form and the judges demand. Miss one of these
  and the entry is incomplete regardless of how good the code is.
- **Use Case brief** — what the system must *do*. The brief separates "basic, common
  expectations" from an explicitly-labelled **Advanced stage**, so everything in that section is
  treated as optional below.

---

## 1. Mandatory

### 1.1 Submission components (Rules → "Submission Components")

| # | Component | Status | Notes |
|---|---|---|---|
| 1 | Project description / summary | ⬜ **Pending** | Short write-up: name, purpose, problem statement |
| 2 | Demo video, max 5 min | ⬜ **Pending** | YouTube unlisted/public, or Drive set to *Anyone with the link → Viewer*. **Private videos are not entertained.** Must cover: intro, problem, tech stack, live demo, impact. **1 mark deducted per 30s over 5:00** |
| 3 | GitHub repo link + clear README with setup instructions | 🟨 **Partial** | Repo exists; **no root `README.md`**, and `frontend/README.md` is still the stock Vite template. Repo must also be **public** |
| 4 | Live prototype / demo link | ⬜ **Pending** | No deploy config anywhere (no `vercel.json`, `netlify.toml`, Dockerfile, or CI workflow). Must be publicly reachable **and working throughout judging** |
| 5 | Slide deck / documentation link | ⬜ **Pending** | Must cover **technical architecture, implementation details, challenges faced, future roadmap** |
| 6 | Team details on the form | ⬜ **Pending** | Team name + representative name, email, contact number |

### 1.2 Eligibility & compliance rules

| Requirement | Status | Notes |
|---|---|---|
| Solution incorporates **AI as a key component** | ✅ **Done** | Two independent AI integrations — see §3 |
| Solution uses **cloud infrastructure** | ✅ **Done** | Supabase: Postgres + Edge Functions. Rules warn that weak cloud integration draws "significantly reduced scores" |
| Above **low-code** minimum; no-code rejected | ✅ **Done** | Full Python pipeline + React app + Deno Edge Function |
| Semi-working prototype (strongly encouraged) | ✅ **Done** | Fully working, not merely semi |
| All work done during the hackathon; original | ✅ **Done** | — |

### 1.3 Core capabilities (Use Case → "What the system should be able to do")

| Capability | Status | Evidence |
|---|---|---|
| **Classify** — comparison requests, new SI requests, invoice queries, general, spam | ✅ **Done** | 520/520 emails correct, macro-F1 **1.000** |
| **Extract** — read SI and BL attachments, identify shipment fields | ✅ **Done** | `.txt`, `.xlsx`, `.docx`, `.pdf`; both `Label: value` and table/label-above-value layouts |
| **Compare** — surface mismatched fields, SI and BL side by side | ✅ **Done** | All 7 fields; defect F1 **1.000**; side-by-side values in the case modal |
| **Ask for help** — escalate with context and reason instead of guessing | ✅ **Done** | 4 reasons (`missing_attachment`, `unreadable`, `wrong_doc_type`, `missing_value`); escalation precision **and** recall **1.000** (20/20) |
| Report says which email, whether a mismatch was found, what needs attention | ✅ **Done** | Dashboard, inbox, review queue, case modal |
| Report "No mismatch detected" when all 7 agree | ✅ **Done** | 154 such cases |
| Output shape keyed by `email_id` matching `sample_submission.json` | ✅ **Done** | `submission.json`, every email present |

**The seven compared fields:** shipper · consignee · notify party · port of loading ·
port of discharge · container count · gross weight (kg).

### 1.4 Verified results

Scored with the organizers' own `scoring.py` against `ground_truth.json`:

| Axis | Score |
|---|---|
| Final score | **1.0000** |
| Stage-1 classification (macro-F1) | **1.0000** |
| Stage-3 defect detection (F1) | **1.0000** |
| End-to-end (defects routed *and* exact fields) | **46/46** |
| Escalation precision / recall | **1.000 / 1.000** |

520 emails · 220 comparison requests · 154 clean · 46 with discrepancies · 20 escalated.
Reproduce with `cd sdoc-hackathon-bundle && python check_score.py`.

---

## 2. Optional

### 2.1 Advanced stage (Use Case → explicitly labelled "Advanced stage")

| Challenge | Status | Notes |
|---|---|---|
| **PDF and Word attachments** — tables and varied page layouts | ✅ **Done** | Two-pass extractor; `.docx` via `zipfile`+`xml.etree`, `.pdf` via `pypdf`. This was worth 10 previously-undetected defects |
| **Messier inputs** — varied labels, formatting differences, misleading subjects, missing attachments | ✅ **Done** | Synonym map matches by meaning (`Port of Loading` ≡ `Load Port` ≡ `POL`); misleading-subject and missing-attachment cases all handled |
| **Reliability** — escalate with source evidence and reason | ✅ **Done** | Every escalation carries its reason and the extracted evidence |
| Human review — a person confirms or corrects, report updates | ✅ **Done** | Review queue + `resolveReviewItem`, persisted to Supabase |
| **Handle processing failures visibly and allow retries** | 🟨 **Partial** | Failures are visible with reasons; **no retry action** to re-run a case after a human fixes the input |
| **Scanned / image-only documents** (OCR or vision LLM) | ⬜ **Pending** | 6 image-only PDFs + 2 garbled files. They already escalate as `unreadable`, which is **correct and scores full marks** — OCR wins no points, it is a demo differentiator only |

### 2.2 Nice-to-have product surface

| Item | Status |
|---|---|
| Dashboard / metrics | ✅ Done |
| Inbox view | ✅ Done |
| Review queue | ✅ Done |
| Classifier Lab (single-email testing) | ✅ Done |
| Analytics view | ✅ Done |
| Reports view | ⬜ Placeholder stub |
| Settings view | ⬜ Placeholder stub |
| Automated tests for the scoring pipeline | ✅ Done — 24 unit tests + score-regression gate |
| Self-scoring without the organizers | ✅ Done — `check_score.py` |
| Auth / multi-tenancy | ⬜ Not built — deliberate hackathon-scope decision |

---

## 3. AI stack — where AI is used

There are **two separate AI integrations**, on **different stacks**, serving different jobs.
They are intentionally not shared code: one is a batch scorer, the other an interactive
single-email tester.

### 3.1 Batch classifier — `sdoc-hackathon-bundle/pipeline.py`

**Job:** label all 520 emails in one run, to produce the scored `submission.json`.
**Runtime:** Python 3, standard library only (`urllib`) — no SDKs, no external deps.
**Class:** `LLMClassifier`

A **six-provider cascade**, each tier tried only when the one above hard-fails:

| Order | Provider | Model | Endpoint | Env var |
|---|---|---|---|---|
| 1 | Groq | `openai/gpt-oss-120b` | `api.groq.com` | `GROQ_API_KEY` |
| 2 | Groq | `llama-3.3-70b-versatile` | `api.groq.com` | `GROQ_API_KEY` |
| 3 | Groq | `qwen/qwen3.8-27b` | `api.groq.com` | `GROQ_API_KEY` |
| 4 | NVIDIA | `nvidia/nemotron-3-ultra-550b-a55b` | `integrate.api.nvidia.com` | `NVIDIA_API_KEY` |
| 5 | Cerebras | `qwen-3-32b` | `api.cerebras.ai` | `CEREBRAS_API_KEY` |
| 6 | OpenRouter | `google/gemini-2.0-flash-001` | `openrouter.ai` | `OPENROUTER_API_KEY` |
| 7 | *(no AI)* | `classify_keywords` | local | — |

- Every provider is called **directly against its own API**, not proxied through OpenRouter, so
  each draws on a separate free-tier quota.
- Order is **evidence-based**, from a live head-to-head on the hardest emails: Groq had zero
  failures and the best accuracy (94%); NVIDIA was accurate but hard-failed ~31% of the time
  (mostly rate limits). Two Gemini models were tested in this chain and **removed** —
  `gemini-3.6-flash` rate-limited almost immediately, and `gemini-3.5-flash-lite` had the worst
  accuracy (69%) while never hard-failing, the worst combination for a fallback tier.
- **Request shape:** `temperature: 0`, single user message, one-of-five label, JSON-string reply.
- **Rate-limit defence:** per-model call caps (`GROQ_MAX_CALLS_PER_RUN` 200,
  `CEREBRAS_MAX_CALLS_PER_RUN` 200, `OPENROUTER_MAX_CALLS_PER_RUN` 40), 2.1s pacing per model,
  immediate short-circuit on the first HTTP 429, 2 attempts with backoff, 30s timeout.
- **Caching:** `llm_cache.json`, keyed by `email_id`, recording which provider produced each
  label. Fallback reasons from all six providers are logged to `llm_fallbacks.log`.
- **Concurrency:** `ThreadPoolExecutor(max_workers=2)` — sized to the free-tier limit.
- **Graceful degradation:** with no keys and no network the pipeline still produces a valid
  scored `submission.json` via `classify_keywords`. That deterministic floor is what currently
  scores 1.0000 — the AI tiers are a resilience layer, not a crutch.

> **Live-testing notes baked into the code:** Groq's Cloudflare front end 403s requests with a
> default `User-Agent` (which is what Python's `urllib` sends), so one is set explicitly; and
> `gpt-oss-120b` sometimes wraps its answer as `{"label": "..."}` instead of a bare JSON string,
> so the parser accepts both shapes.

### 3.2 Interactive classifier — `supabase/functions/identify-document-request/`

**Job:** classify **one** email on demand, from the Classifier Lab tab, with a full audit trail.
**Runtime:** Deno / TypeScript, deployed as a **Supabase Edge Function** (cloud infrastructure).
**Called by:** `frontend/src/features/inbox/api/identifyDocumentRequest.ts` via
`supabase.functions.invoke`.

A **two-tier** design — deliberately not the same cascade as §3.1:

1. **Deterministic weighted rules first** (`supabase/functions/_shared/document-classifier.ts`).
   Each rule contributes a weight to a category. The rules decide alone only when the result is
   **decisive** — top score ≥ 5 **and** a margin ≥ 2 over the runner-up. No model is called, and
   `method: "deterministic"` is recorded with the matched reasons.
2. **AI only for genuinely ambiguous cases** — OpenRouter `google/gemini-2.0-flash-001`, with
   `temperature: 0`, `seed: 20260919`, `max_tokens: 140`, `provider.require_parameters: true`,
   and a **strict JSON-schema `response_format`** so the model cannot return free text.

- **Persistence:** every decision is written to Postgres (`classification_decisions`,
  `classification_runs`) with its `input_hash`, method, model, reasons and
  `raw_model_output` — so any label can be audited after the fact.
- **Caching:** by `input_hash`; a repeat of the same email reuses the stored decision, and the
  saved row is re-read so the database is the authority under concurrency.
- **Security:** the function uses the service-role key and is the only thing that touches those
  two tables; they stay locked down under RLS while the dashboard's anon key cannot read them.

### 3.3 Where AI is deliberately **not** used

**Comparison is never a model call.** Once fields are extracted, deciding match vs. mismatch vs.
formatting variant is plain deterministic Python. Every reported value must be traceable to an
exact substring in the source document; a value that cannot be verified is dropped and the field
is escalated to a human rather than reported as fact.

This is the core design principle — *the AI reads, code decides* — and it is why every
discrepancy in the report is reproducible and none can be hallucinated. It is also worth stating
plainly in the deck and the video: it is the answer to "how do you know the AI didn't make this
up?"

No vision model is used anywhere; the pipeline is text-only.

---

## 4. What to do next, in priority order

1. **Write the root `README.md`** with setup instructions — mandatory, and judges read it first.
2. **Deploy the frontend** and get a public URL — mandatory, and it must stay up through judging.
   `npm run build` already succeeds (273 KB), so this is a hosting step, not a code change.
3. **Build the slide deck** — architecture, implementation, challenges, roadmap.
   The strongest slide is §1.4: most teams will *claim* accuracy, you can *demonstrate* 1.0000
   on 520 emails with a regression gate behind it.
4. **Record the demo video**, ≤ 5:00. Watch the clock — 1 mark per 30s over.
5. *(Optional)* Add a retry action to the review queue — closes the last stated gap in the
   Use Case brief's reliability section.
