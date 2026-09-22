-- Run after the main schema. Hard cap: 20 attempted AI requests/user/UTC day.
-- Counts only; no document text or model output is stored in this table.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  requests integer not null default 0 check (requests between 0 and 20),
  primary key (user_id, usage_date)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.consume_ai_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  day_utc date := (clock_timestamp() at time zone 'UTC')::date;
  used integer;
begin
  if caller is null then raise exception 'Authentication required'; end if;
  insert into public.ai_usage (user_id, usage_date, requests)
    values (caller, day_utc, 1)
    on conflict (user_id, usage_date) do update
      set requests = public.ai_usage.requests + 1
      where public.ai_usage.requests < 20
    returning requests into used;
  return used is not null;
end;
$$;
revoke all on function public.consume_ai_quota() from public, anon;
grant execute on function public.consume_ai_quota() to authenticated;
