-- Optional integration check in Supabase SQL Editor AFTER creating TWO test users.
-- Replace the two UUIDs below with Authentication > Users IDs. All writes roll back.
-- Expected: PASS. Run only against your own test project.
begin;

select set_config('cfa.test_owner', '11111111-1111-4111-8111-111111111111', true);
select set_config('cfa.test_other', '22222222-2222-4222-8222-222222222222', true);

do $$ begin
  if not exists (select 1 from auth.users where id = current_setting('cfa.test_owner')::uuid)
     or not exists (select 1 from auth.users where id = current_setting('cfa.test_other')::uuid) then
    raise exception 'Replace both example UUIDs with real, different test user IDs before running this test.';
  end if;
  if current_setting('cfa.test_owner') = current_setting('cfa.test_other') then raise exception 'Use two different users.'; end if;
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('cfa.test_owner'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare first_result jsonb; retry_result jsonb; stale_result jsonb; second_result jsonb; denied boolean := false;
begin
  first_result := public.apply_study_change(current_setting('cfa.test_owner')::uuid, 'notes', 'integration-note', '{"id":"integration-note","text":"first"}'::jsonb, false, 0, 'aaaaaaaa-1111-4111-8111-111111111111');
  if first_result->>'status' <> 'applied' or first_result->'record'->>'revision' <> '1' then raise exception 'Initial insert failed'; end if;
  retry_result := public.apply_study_change(current_setting('cfa.test_owner')::uuid, 'notes', 'integration-note', '{"id":"integration-note","text":"first"}'::jsonb, false, 0, 'aaaaaaaa-1111-4111-8111-111111111111');
  if retry_result <> first_result then raise exception 'Idempotent retry failed'; end if;
  second_result := public.apply_study_change(current_setting('cfa.test_owner')::uuid, 'notes', 'integration-note', '{"id":"integration-note","text":"second"}'::jsonb, false, 1, 'aaaaaaaa-2222-4222-8222-222222222222');
  if second_result->'record'->>'revision' <> '2' then raise exception 'Revision increment failed'; end if;
  stale_result := public.apply_study_change(current_setting('cfa.test_owner')::uuid, 'notes', 'integration-note', '{"id":"integration-note","text":"stale"}'::jsonb, false, 1, 'aaaaaaaa-3333-4333-8333-333333333333');
  if stale_result->>'status' <> 'conflict' or stale_result->'record'->'payload'->>'text' <> 'second' then raise exception 'Stale write overwrote current data'; end if;
  begin
    perform public.apply_study_change(current_setting('cfa.test_other')::uuid, 'notes', 'foreign-note', '{"id":"foreign-note"}'::jsonb, false, 0, 'aaaaaaaa-4444-4444-8444-444444444444');
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Cross-account write was allowed'; end if;
  denied := false;
  begin
    update public.study_records set deleted = true where id = 'integration-note';
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Direct write bypassed revision checks'; end if;
end $$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('cfa.test_other'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  if exists (select 1 from public.study_records where owner_id = current_setting('cfa.test_owner')::uuid) then raise exception 'Cross-account read was allowed'; end if;
end $$;
reset role;
set local role anon;
do $$ declare denied boolean := false; begin
  begin
    perform 1 from public.study_records limit 1;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Anonymous access was allowed'; end if;
end $$;
reset role;
select 'PASS: isolation, idempotency, revision conflicts and anonymous denial' as result;
rollback;
