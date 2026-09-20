-- Shared single-workspace intake: browser users may create cases and upload
-- their source documents. No service-role credentials are exposed to clients.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-attachments', 'case-attachments', false, 20971520,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shared workspace can create inbox records" on public.inbox_records;
create policy "shared workspace can create inbox records"
  on public.inbox_records for insert to anon, authenticated with check (true);

drop policy if exists "shared workspace can upload case attachments" on storage.objects;
create policy "shared workspace can upload case attachments"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'case-attachments');

drop policy if exists "shared workspace can read case attachments" on storage.objects;
create policy "shared workspace can read case attachments"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'case-attachments');
