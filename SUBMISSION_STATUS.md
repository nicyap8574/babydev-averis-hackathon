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

### 3.1 Email intent classification

The Supabase Edge Function applies deterministic weighted rules first, then calls the Email Classifier AI Stack for ambiguous cases: three Groq models, NVIDIA Nemotron, then Cerebras Qwen. Provider decisions are cached and audited in Postgres. API keys are Supabase function secrets, never frontend variables.

The local batch classifier uses the same provider family before its keyword fallback. Its SI/BL comparison remains deterministic Python code; models do not decide whether document fields match.

### 3.2 Hosted and local processing boundary

The frontend supports shared case intake and file upload through Supabase. The batch pipeline extracts PDF, DOCX, XLSX, and text attachments and syncs completed field comparisons to Supabase. Browser-created cases are classified but do not yet run through a hosted document extractor/comparator, so they remain pending comparison.

### 3.3 Where AI is deliberately not used

Extracted values must be grounded in document text. SI/BL matching, mismatch detection, and normalization are deterministic; incomplete or unreadable evidence should go to human review.
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
