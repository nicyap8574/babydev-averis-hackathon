-- Lets the shared workspace archive/unarchive cases from the inbox table.
alter table public.inbox_records
  add column if not exists archived boolean not null default false;

create index if not exists inbox_records_archived_idx
  on public.inbox_records (archived);

drop policy if exists "shared workspace can archive inbox records" on public.inbox_records;
create policy "shared workspace can archive inbox records"
  on public.inbox_records for update to anon, authenticated
  using (true) with check (true);

-- RLS is row-level only, so the policy above would otherwise let a browser
-- client rewrite any column on any row - category, status, field_comparison,
-- even body. Narrow it with a column grant so the shared workspace can set
-- nothing but the archive flag. service_role is a separate role and keeps the
-- full grant the Edge Function and comparison service rely on.
revoke update on public.inbox_records from anon, authenticated;
grant update (archived) on public.inbox_records to anon, authenticated;
