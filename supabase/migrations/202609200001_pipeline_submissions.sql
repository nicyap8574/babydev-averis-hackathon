-- Extends the schema from 202609190001_identify_document_request.sql with
-- what pipeline.py's batch classification + SI/BL comparison needs, without
-- touching that migration's existing tables/constraints/RLS posture (the
-- Edge Function and its tests depend on the shape being unchanged).
--
-- inbox_records rows created by the Edge Function never populate the columns
-- added below (they stay null); rows synced by pipeline.py (see
-- sdoc-hackathon-bundle/supabase_sync.py) populate both the original
-- classification columns and these.

alter table public.inbox_records
  add column if not exists status text
    check (status in ('OK', 'MISMATCH', 'NEEDS_REVIEW')),
  add column if not exists review_reason text,
  add column if not exists has_defect boolean not null default false,
  add column if not exists defect_fields jsonb not null default '[]'::jsonb,
  add column if not exists field_comparison jsonb not null default '[]'::jsonb,
  add column if not exists pipeline_synced_at timestamptz;

create index if not exists inbox_records_status_idx
  on public.inbox_records (status);

-- Replaces sdoc-hackathon-bundle/review_queue.json for Supabase-backed runs.
create table if not exists public.review_queue_items (
  email_id text primary key references public.inbox_records(email_id) on delete cascade,
  reason text,
  resolved boolean not null default false,
  resolution text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Replaces sdoc-hackathon-bundle/review_resolutions.json (append-only) for
-- Supabase-backed runs.
create table if not exists public.review_resolutions (
  id uuid primary key default gen_random_uuid(),
  email_id text not null references public.inbox_records(email_id) on delete cascade,
  resolution text not null,
  created_at timestamptz not null default now()
);

alter table public.review_queue_items enable row level security;
alter table public.review_resolutions enable row level security;

-- The review UI (frontend/) talks to Supabase directly with the anon/
-- publishable key, which RLS applies to - the original migration left every
-- table locked down with no policies (correct when only server-side code
-- with the service-role key touched them). These policies are scoped only
-- to what the dashboard needs: read the dashboard's data, and let a human
-- resolve a review-queue item. classification_decisions/classification_runs
-- stay untouched - the dashboard doesn't read them, only the Edge Function
-- does (with the service-role key, which bypasses RLS entirely).
--
-- There is no auth/multi-tenancy anywhere in this project, so these are
-- deliberately open (`using (true)`) rather than scoped to a user - a
-- hackathon-scope tradeoff, not an oversight.
drop policy if exists "dashboard can read inbox_records" on public.inbox_records;
create policy "dashboard can read inbox_records"
  on public.inbox_records for select using (true);

drop policy if exists "dashboard can read review_queue_items" on public.review_queue_items;
create policy "dashboard can read review_queue_items"
  on public.review_queue_items for select using (true);

drop policy if exists "dashboard can resolve review_queue_items" on public.review_queue_items;
create policy "dashboard can resolve review_queue_items"
  on public.review_queue_items for update using (true);

drop policy if exists "dashboard can log review_resolutions" on public.review_resolutions;
create policy "dashboard can log review_resolutions"
  on public.review_resolutions for insert with check (true);

comment on column public.inbox_records.status is
  'SI/BL comparison verdict from pipeline.py (OK/MISMATCH/NEEDS_REVIEW). Null for rows only ever touched by the Edge Function.';
comment on column public.inbox_records.field_comparison is
  'Precomputed per-field SI/BL values + match/mismatch status (pipeline.py field_comparison_rows()), so the dashboard never needs to parse attachments itself.';
comment on column public.inbox_records.pipeline_synced_at is
  'Set each time sdoc-hackathon-bundle/supabase_sync.py upserts this row from a pipeline.py run.';
