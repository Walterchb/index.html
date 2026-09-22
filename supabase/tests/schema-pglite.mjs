// PostgreSQL policy/CAS integration checks with an isolated PGlite database.
// npm install --no-save @electric-sql/pglite
// node supabase/tests/schema-pglite.mjs
// This emulates Supabase auth/storage schemas, not hosted Supabase services.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { PGlite } = await import(process.env.PGLITE_PATH || '@electric-sql/pglite');
const here = path.dirname(fileURLToPath(import.meta.url));
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid
    $$;
    create table storage.buckets (id text primary key, name text not null, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id bigserial primary key, bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1)-1, 0)]
    $$;
    grant usage on schema auth, storage to anon, authenticated;
    grant all on storage.objects to anon, authenticated;
    grant usage on sequence storage.objects_id_seq to anon, authenticated;
    insert into auth.users values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
  `);
  const schema = await fs.readFile(path.join(here, '../schema.sql'), 'utf8');
  await db.exec(schema); await db.exec(schema);
  console.log('PASS schema installation and repeat installation');
  const assertions = await db.exec(await fs.readFile(path.join(here, 'rls_and_revision.sql'), 'utf8'));
  assert(assertions.some(result => result.rows?.some(row => String(row.result).startsWith('PASS:'))));
  console.log('PASS owner isolation, anonymous denial, direct-write denial, CAS conflict and idempotent retry');
  await db.exec(`
    -- Simulate unrelated application broad policies: our guards must still win.
    create policy broad_storage_policy on storage.objects for all to public using (true) with check (true);
    begin;
    select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
    set local role authenticated;
    insert into storage.objects(bucket_id,name) values ('cfa-documents','11111111-1111-4111-8111-111111111111/file-1');
    do $$ begin
      if (select count(*) from storage.objects) <> 1 then raise exception 'Owner file not visible'; end if;
    end $$;
    update storage.objects set name='11111111-1111-4111-8111-111111111111/changed';
    delete from storage.objects;
    reset role;
    do $$ begin
      if not exists(select 1 from storage.objects where name='11111111-1111-4111-8111-111111111111/file-1') then raise exception 'Immutable file was changed'; end if;
    end $$;
    select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
    set local role authenticated;
    do $$ declare denied boolean := false; begin
      if exists(select 1 from storage.objects) then raise exception 'Foreign private file visible'; end if;
      begin
        insert into storage.objects(bucket_id,name) values ('cfa-documents','11111111-1111-4111-8111-111111111111/foreign');
      exception when insufficient_privilege then denied := true; end;
      if not denied then raise exception 'Foreign private upload allowed'; end if;
    end $$;
    reset role;
    select set_config('request.jwt.claims','{"role":"anon"}',true);
    set local role anon;
    do $$ begin
      if exists(select 1 from storage.objects where bucket_id='cfa-documents') then raise exception 'Anonymous private file visible'; end if;
    end $$;
    reset role;
    rollback;
  `);
  console.log('PASS private Storage policies withstand broad unrelated policies; own files immutable');
  console.log('PostgreSQL checks passed. Hosted Supabase Auth/email/Storage transport require deployment credentials.');
} finally { await db.close(); }
