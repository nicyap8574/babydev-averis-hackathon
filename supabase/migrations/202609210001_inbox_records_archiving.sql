-- Let shared-workspace clients archive and restore inbox records without
-- granting them permission to rewrite the rest of the pipeline-managed row.
alter table public.inbox_records
  add column if not exists archived boolean not null default false;

create index if not exists inbox_records_archived_idx
  on public.inbox_records (archived);

drop policy if exists "shared workspace can archive inbox records" on public.inbox_records;
create policy "shared workspace can archive inbox records"
  on public.inbox_records for update to anon, authenticated
  using (true) with check (true);

-- RLS controls which rows are addressable. Restrict the update privilege to
-- the archive flag so browser clients cannot modify pipeline-managed fields.
revoke update on public.inbox_records from anon, authenticated;
grant update (archived) on public.inbox_records to anon, authenticated;
