-- CFA Study · run in the Supabase SQL Editor as the project administrator.
-- Idempotent installation. Does not delete existing study data.
begin;

create table if not exists public.study_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('courses','modules','lessons','documents','cards','questions','progress','notes','attempts','sessions','settings')),
  id text not null check (id ~ '^[a-zA-Z0-9_.:-]{1,160}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, kind, id),
  constraint study_payload_id_matches check (payload->>'id' = id)
);

create table if not exists public.study_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, operation_id)
);

alter table public.study_records enable row level security;
alter table public.study_operations enable row level security;

-- Only the owner can read their rows. Mutations go through the checked RPC.
revoke all on table public.study_records from public, anon, authenticated;
revoke all on table public.study_operations from public, anon, authenticated;
grant select on table public.study_records to authenticated;

drop policy if exists "cfa_owner_read" on public.study_records;
create policy "cfa_owner_read" on public.study_records
  for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "cfa_owner_guard" on public.study_records;
create policy "cfa_owner_guard" on public.study_records as restrictive
  for all to public using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create or replace function public.apply_study_change(
  p_owner_id uuid,
  p_kind text,
  p_id text,
  p_payload jsonb,
  p_deleted boolean,
  p_expected_revision bigint,
  p_operation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_current public.study_records%rowtype;
  v_result jsonb;
  v_existing_revision bigint;
begin
  if v_user is null or p_owner_id is distinct from v_user then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('courses','modules','lessons','documents','cards','questions','progress','notes','attempts','sessions','settings')
     or p_id is null or p_id !~ '^[a-zA-Z0-9_.:-]{1,160}$'
     or p_expected_revision is null or p_expected_revision < 0
     or p_deleted is null or p_operation_id is null
     or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or (p_payload->>'id') is distinct from p_id
     or pg_catalog.octet_length(p_payload::text) > 8388608 then
    raise exception 'Invalid study change' using errcode = '22023';
  end if;

  -- Serialize each entity, including the first insert where no row exists yet.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text || ':' || p_kind || ':' || p_id, 0));
  select result into v_result from public.study_operations
    where owner_id = v_user and operation_id = p_operation_id;
  if found then return v_result; end if;

  select * into v_current from public.study_records
    where owner_id = v_user and kind = p_kind and id = p_id for update;
  v_existing_revision := case when found then v_current.revision else 0 end;
  if v_existing_revision <> p_expected_revision then
    return pg_catalog.jsonb_build_object('status', 'conflict', 'record',
      case when v_existing_revision = 0 then null else pg_catalog.to_jsonb(v_current) end);
  end if;

  insert into public.study_records (owner_id, kind, id, payload, revision, deleted, updated_at)
    values (v_user, p_kind, p_id, p_payload, v_existing_revision + 1, p_deleted, pg_catalog.clock_timestamp())
    on conflict (owner_id, kind, id) do update
      set payload = excluded.payload, revision = excluded.revision,
          deleted = excluded.deleted, updated_at = excluded.updated_at
    returning * into v_current;
  -- Receipt stores the accepted revision only, avoiding duplicated PDF text on every edit.
  v_result := pg_catalog.jsonb_build_object('status', 'applied', 'record', pg_catalog.jsonb_build_object('revision', v_current.revision));
  insert into public.study_operations (owner_id, operation_id, result)
    values (v_user, p_operation_id, v_result);
  return v_result;
end;
$$;

revoke all on function public.apply_study_change(uuid,text,text,jsonb,boolean,bigint,uuid) from public, anon;
grant execute on function public.apply_study_change(uuid,text,text,jsonb,boolean,bigint,uuid) to authenticated;

-- Files are private and immutable. Replacements use a new file ID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cfa-documents', 'cfa-documents', false, 41943040,
  array['application/pdf','image/png','image/jpeg','image/webp','image/bmp','text/plain','text/markdown','application/octet-stream'])
on conflict (id) do update set public = false, file_size_limit = 41943040, allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive guards also protect this bucket if another application installed
-- a broad permissive policy on the shared storage.objects table.
drop policy if exists "cfa_files_isolation_guard" on storage.objects;
create policy "cfa_files_isolation_guard" on storage.objects as restrictive for all to public
  using (bucket_id <> 'cfa-documents' or (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id <> 'cfa-documents' or (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "cfa_files_immutable_guard" on storage.objects;
create policy "cfa_files_immutable_guard" on storage.objects as restrictive for update to public
  using (bucket_id <> 'cfa-documents') with check (bucket_id <> 'cfa-documents');
drop policy if exists "cfa_files_keep_source_guard" on storage.objects;
create policy "cfa_files_keep_source_guard" on storage.objects as restrictive for delete to public
  using (bucket_id <> 'cfa-documents');

drop policy if exists "cfa_files_owner_read" on storage.objects;
create policy "cfa_files_owner_read" on storage.objects for select to authenticated
  using (bucket_id = 'cfa-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "cfa_files_owner_insert" on storage.objects;
create policy "cfa_files_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'cfa-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No UPDATE policy: a file cannot silently replace another device's cached bytes.
-- No DELETE policy: references and exported recovery copies stay recoverable.
-- If you intentionally erase source files, use the Supabase Storage dashboard
-- after downloading a backup. Deleting a document in the app deletes its record.

commit;
