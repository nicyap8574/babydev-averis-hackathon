# Reports backend implementation plan

## Goal

Turn the current Reports placeholder into a durable, searchable archive of **completed discrepancy reports**. A report should preserve the SI/BL comparison that produced it and show the full human-review trail where one exists.

This is a product enhancement, not a hackathon scoring requirement. It should be scheduled after the mandatory README, deployment, deck, and demo-video work.

## Definition of a completed report

The Reports page will show two kinds of cases:

| Case outcome | Included? | Completion point |
| --- | --- | --- |
| `MISMATCH` | Yes | The comparison pipeline records the mismatch. |
| `NEEDS_REVIEW`, later resolved | Yes | A reviewer saves a resolution. |
| `OK` | No | It is a clean verification, not a discrepancy report. It remains accessible from Inbox. |
| `NEEDS_REVIEW`, unresolved | No | It remains in Review queue. |

The report is a point-in-time record of the completed case. This matters because later pipeline re-runs or document updates must not silently change what a reviewer signed off on.

## Existing foundation

The project already persists the data required to create reports:

- `inbox_records` contains the sender, subject, comparison verdict, mismatched fields, SI/BL field values, attachments, and pipeline timestamp.
- `review_queue_items` records whether an escalation is resolved and its latest resolution.
- `review_resolutions` is already append-only and provides reviewer-history entries (currently resolution text and timestamp only).
- The case modal can already produce a printable client-side report from live data.

What is absent is a saved report record, an API to list it, a Reports UI, and report-history data joined into the case modal.

## Recommended data model

Add a migration named `supabase/migrations/202609210002_verification_reports.sql`. The `202609210001` migration is already reserved for inbox archiving.

### `verification_reports`

One report per completed case, keyed by `email_id`.

| Column | Type | Purpose |
| --- | --- | --- |
| `email_id` | `text` primary key, FK to `inbox_records` | Stable case/report identifier. |
| `report_type` | `text` check: `automated_mismatch`, `reviewed_escalation` | Explains how the case completed. |
| `verdict` | `text` check: `MISMATCH`, `RESOLVED_AFTER_REVIEW` | Display-ready final outcome. |
| `sender`, `subject` | `text` | Searchable snapshot header. |
| `status`, `review_reason` | `text` | Original pipeline result and escalation context. |
| `mismatches`, `field_comparison`, `attachments` | `jsonb` | Immutable SI/BL evidence snapshot. |
| `pipeline_synced_at` | `timestamptz` nullable | Source run time. |
| `completed_at` | `timestamptz` | When it became reportable. |
| `created_at`, `updated_at` | `timestamptz` | Audit/maintenance timestamps. |

Indexes:

- `completed_at desc` for default newest-first listing.
- `report_type, completed_at desc` for filtering.
- `lower(sender)` and `lower(subject)` for the current search field. If the dataset grows materially, replace these with one full-text-search generated column and GIN index.

Enable RLS and add a public read policy matching the present hackathon dashboard model (`using (true)`). No browser insert/update/delete policy should be created; report writes happen only through trusted server/pipeline paths.

### Reviewer identity decision

The existing product has no authentication, so it cannot truthfully display a reviewer name. The first version should label history entries as **“Human reviewer”** and show resolution text plus timestamp. When auth is added, extend `review_resolutions` with `reviewer_id uuid references auth.users(id)` and snapshot `reviewer_display_name` into the report event.

## Report creation and lifecycle

Use database functions/triggers rather than relying only on frontend calls. This guarantees reports appear whether data arrived from the batch sync, `/api/compare`, or future workers.

```text
pipeline / comparison service updates inbox_records
            |
            +-- status = MISMATCH ------> upsert verification_reports
            |
            +-- status = NEEDS_REVIEW --> remains only in review queue

reviewer resolves review_queue_items
            |
            +-- append review_resolutions -> upsert verification_reports
```

Implementation details:

1. Add a `upsert_verification_report(email_id, report_type, completed_at)` `security definer` SQL function. It reads `inbox_records`, copies the report snapshot fields, and uses `insert ... on conflict (email_id) do update`.
2. Add an `after insert or update of status, field_comparison, defect_fields` trigger on `inbox_records`. It invokes the function only when `NEW.status = 'MISMATCH'`.
3. Add an `after update of resolved` trigger on `review_queue_items`. When `NEW.resolved = true` and the associated inbox row is `NEEDS_REVIEW`, it upserts a `reviewed_escalation` report with `NEW.resolved_at` (or `now()` as a safe fallback).
4. Do **not** overwrite a report’s comparison snapshot during an ordinary pipeline re-sync. Only update operational header metadata such as `updated_at`; evidence changes require an explicit new report version. This protects auditability.
5. The review-resolution insert must occur before the resolved trigger or the trigger must read the queue's `resolution` directly. The preferred small refactor is one RPC/Edge Function that atomically appends the history entry, marks the queue item resolved, and creates/updates the report.

### Atomic review action

The current browser performs two separate writes in `resolveReviewItem`: update queue, then insert history. A network failure between them can leave inconsistent history. Replace this with a `resolve_review_item(email_id, resolution)` Postgres RPC or a Supabase Edge Function that executes, in one transaction:

1. lock/update the unresolved queue row;
2. append `review_resolutions`;
3. create the report snapshot; and
4. return the updated queue/report summary.

This also removes the need to grant the browser broad direct update/insert permissions for those two tables.

## Backend query contract

Expose two read paths, initially through Supabase table/view queries. A dedicated REST endpoint is unnecessary unless auth, pagination rules, or external consumers demand it.

### `fetchReports(filters)`

Returns a paginated summary, newest first:

```ts
type ReportListItem = {
  email_id: string;
  subject: string;
  sender: string;
  report_type: "automated_mismatch" | "reviewed_escalation";
  verdict: "MISMATCH" | "RESOLVED_AFTER_REVIEW";
  mismatch_count: number;
  completed_at: string;
  latest_resolution: string | null;
};
```

Filters: free-text sender/subject search, `report_type`, and optional completed-date range. Use a `range()` query and return the Supabase count for pagination.

### `fetchReportDetail(emailId)`

Returns the saved snapshot plus history:

```ts
type ReportDetail = {
  report: VerificationReport;
  review_history: Array<{
    id: string;
    resolution: string;
    created_at: string;
    reviewer_label: "Human reviewer";
  }>;
};
```

History must be queried by `email_id`, ordered ascending by `created_at`. The existing `review_resolutions` table is the authoritative append-only source; do not store a duplicate history JSON blob in `verification_reports`.

## Frontend scope

1. Replace `PlaceholderView` for `reports` with `ReportsView`.
2. Render a table/card list with case subject/ID, sender, result, mismatch count, completed date, and a “Reviewed” marker where applicable.
3. Connect the existing top-bar search to Reports and debounce it (about 250 ms). The current `searchEnabled` condition must include `view === "reports"`.
4. Clicking a row opens a `ReportModal` (or extends `CaseModal` with saved-report mode) that displays the snapshot, SI/BL comparison table, attachments, and a chronological “Review history” section.
5. Add **Export report** in the report detail. Reuse `buildCaseReport`, but feed it the saved snapshot and append reviewer history. Browser print-to-PDF remains appropriate for v1; no PDF blob is stored server-side.
6. Include loading, empty, failed-load, and no-search-match states. The page should clearly say “No completed discrepancy reports yet” rather than implying missing data.

## Backfill and rollout

1. Apply the migration to a development Supabase project.
2. Run a one-off, idempotent SQL backfill:
   - create `automated_mismatch` reports for existing `inbox_records.status = 'MISMATCH'`;
   - create `reviewed_escalation` reports for resolved queue entries whose source status is `NEEDS_REVIEW`.
3. Verify counts: report count should equal mismatch count plus resolved-review count, excluding duplicate `email_id`s by design.
4. Deploy the pipeline/worker changes and frontend together. The trigger provides protection during a staggered deployment.
5. Preserve the report stub behind no feature flag—the real page can ship once the migration is live.

## Tests and acceptance checks

### Automated

- SQL/integration test: a `MISMATCH` inbox upsert creates exactly one immutable report.
- SQL/integration test: resolving a `NEEDS_REVIEW` case creates one `reviewed_escalation` report and one history entry atomically.
- SQL/integration test: re-syncing a case does not alter the saved field-comparison snapshot.
- API tests: filtering, newest-first ordering, pagination, and history ordering.
- Unit tests: report-to-print HTML includes reviewer history and escapes every user-controlled string.
- Frontend tests: loading, empty, search, open-detail, and export actions.

### Manual acceptance

1. Run a mismatch case through the pipeline; it appears in Reports without a browser refresh after the list reload.
2. Resolve an escalated case; it leaves the pending queue and appears in Reports with its resolution and timestamp.
3. Change/re-run the original case data; confirm the report snapshot remains unchanged.
4. Search by subject and sender, open a report, and export/print it successfully.
5. Use Playwright to inspect desktop and narrow-screen layouts, including the empty and populated report states.

## Non-goals for v1

- Storing generated PDF files or emailing reports.
- Per-user permissions and reviewer names (requires authentication/multi-tenancy).
- Versioned/amended reports after an underlying document changes; retain snapshot behavior first, then add explicit report versions if the workflow needs amendments.
- Including clean (`OK`) validations in the discrepancy archive.

## Estimated implementation slices

| Slice | Work |
| --- | --- |
| 1. Persistence | Migration, triggers/RPC, RLS, backfill script. |
| 2. Data access | Typed report queries and atomic review resolution client change. |
| 3. Interface | Reports list, report detail/history, print export integration. |
| 4. Verification | Tests, migration/backfill validation, Playwright regression pass. |

## Decision requested before implementation

Approve the definition above—**mismatches plus resolved escalations, clean matches excluded**—and the immutable snapshot approach. The only product choice that materially changes the design is whether successful `OK` verifications should also be archived as reports.
