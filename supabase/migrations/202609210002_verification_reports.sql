-- Durable, point-in-time records for completed discrepancy cases. A report is
-- created automatically for an automated mismatch or a resolved escalation;
-- browser clients can read them but cannot create or amend their evidence.

create table if not exists public.verification_reports (
  email_id text primary key references public.inbox_records(email_id) on delete cascade,
  report_type text not null check (report_type in ('automated_mismatch', 'reviewed_escalation')),
  verdict text not null check (verdict in ('MISMATCH', 'RESOLVED_AFTER_REVIEW')),
  sender text,
  subject text not null,
  status text,
  review_reason text,
  mismatches jsonb not null default '[]'::jsonb,
  field_comparison jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  pipeline_synced_at timestamptz,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists verification_reports_completed_at_idx
  on public.verification_reports (completed_at desc);
create index if not exists verification_reports_type_completed_at_idx
  on public.verification_reports (report_type, completed_at desc);
create index if not exists verification_reports_sender_lower_idx
  on public.verification_reports (lower(sender));
create index if not exists verification_reports_subject_lower_idx
  on public.verification_reports (lower(subject));

alter table public.verification_reports enable row level security;

drop policy if exists "dashboard can read verification_reports" on public.verification_reports;
create policy "dashboard can read verification_reports"
  on public.verification_reports for select using (true);

drop policy if exists "dashboard can read review_resolutions" on public.review_resolutions;
create policy "dashboard can read review_resolutions"
  on public.review_resolutions for select using (true);

grant select on public.verification_reports, public.review_resolutions to anon, authenticated;

-- Do not permit partial browser writes now that resolution is transactional.
drop policy if exists "dashboard can resolve review_queue_items" on public.review_queue_items;
drop policy if exists "dashboard can log review_resolutions" on public.review_resolutions;

create or replace function public.upsert_verification_report(
  p_email_id text,
  p_report_type text,
  p_completed_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  source_row public.inbox_records%rowtype;
begin
  select * into source_row
    from public.inbox_records
    where email_id = p_email_id;

  if not found then
    raise exception 'Cannot create report: inbox record % does not exist', p_email_id;
  end if;
  if p_report_type = 'automated_mismatch' and source_row.status is distinct from 'MISMATCH' then
    raise exception 'Cannot create mismatch report for status %', source_row.status;
  end if;
  if p_report_type = 'reviewed_escalation' and source_row.status is distinct from 'NEEDS_REVIEW' then
    raise exception 'Cannot create reviewed report for status %', source_row.status;
  end if;

  insert into public.verification_reports (
    email_id, report_type, verdict, sender, subject, status, review_reason,
    mismatches, field_comparison, attachments, pipeline_synced_at, completed_at
  ) values (
    source_row.email_id,
    p_report_type,
    case when p_report_type = 'automated_mismatch' then 'MISMATCH' else 'RESOLVED_AFTER_REVIEW' end,
    source_row.sender,
    source_row.subject,
    source_row.status,
    source_row.review_reason,
    source_row.defect_fields,
    source_row.field_comparison,
    source_row.attachments,
    source_row.pipeline_synced_at,
    coalesce(p_completed_at, now())
  ) on conflict (email_id) do nothing;
end;
$$;

create or replace function public.create_mismatch_verification_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'MISMATCH' then
    perform public.upsert_verification_report(
      new.email_id,
      'automated_mismatch',
      coalesce(new.pipeline_synced_at, now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists inbox_records_create_mismatch_report on public.inbox_records;
create trigger inbox_records_create_mismatch_report
  after insert or update of status, field_comparison, defect_fields, pipeline_synced_at
  on public.inbox_records
  for each row execute function public.create_mismatch_verification_report();

create or replace function public.create_resolved_verification_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.resolved = true and old.resolved is distinct from true then
    perform public.upsert_verification_report(
      new.email_id,
      'reviewed_escalation',
      coalesce(new.resolved_at, now())
    );
  end if;
  return new;
end;
$$;

drop trigger if exists review_queue_items_create_resolved_report on public.review_queue_items;
create trigger review_queue_items_create_resolved_report
  after update of resolved on public.review_queue_items
  for each row execute function public.create_resolved_verification_report();

revoke all on function public.upsert_verification_report(text, text, timestamptz) from public;
revoke all on function public.create_mismatch_verification_report() from public;
revoke all on function public.create_resolved_verification_report() from public;

-- The browser makes one RPC call rather than two independent writes, so a
-- saved resolution, its audit entry, and the report snapshot cannot diverge.
create or replace function public.resolve_review_item(
  p_email_id text,
  p_resolution text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  queue_row public.review_queue_items%rowtype;
  source_status text;
begin
  if nullif(btrim(p_resolution), '') is null then
    raise exception 'Resolution cannot be empty';
  end if;

  select * into queue_row
    from public.review_queue_items
    where email_id = p_email_id
    for update;
  if not found then
    raise exception 'Review item % was not found', p_email_id;
  end if;
  if queue_row.resolved then
    raise exception 'Review item % is already resolved', p_email_id;
  end if;

  select status into source_status
    from public.inbox_records
    where email_id = p_email_id;
  if source_status is distinct from 'NEEDS_REVIEW' then
    raise exception 'Only NEEDS_REVIEW cases can be resolved';
  end if;

  insert into public.review_resolutions (email_id, resolution)
    values (p_email_id, btrim(p_resolution));

  update public.review_queue_items
    set resolved = true,
        resolution = btrim(p_resolution),
        resolved_at = now(),
        updated_at = now()
    where email_id = p_email_id;
end;
$$;

revoke all on function public.resolve_review_item(text, text) from public;
grant execute on function public.resolve_review_item(text, text) to anon, authenticated;

-- Idempotent migration backfill. Existing snapshots are never changed.
select public.upsert_verification_report(email_id, 'automated_mismatch', coalesce(pipeline_synced_at, now()))
  from public.inbox_records
  where status = 'MISMATCH';

select public.upsert_verification_report(queue.email_id, 'reviewed_escalation', coalesce(queue.resolved_at, now()))
  from public.review_queue_items queue
  join public.inbox_records inbox on inbox.email_id = queue.email_id
  where queue.resolved = true and inbox.status = 'NEEDS_REVIEW';
