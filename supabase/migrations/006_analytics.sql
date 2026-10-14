-- Детская аналитика Finni. Без клиентского SELECT/INSERT. Не меняет 001–005.

alter table public.family_settings
  add column if not exists analytics_on boolean not null default false;
alter table public.family_settings
  add column if not exists age_group text not null default '10-11';
alter table public.family_settings drop constraint if exists family_settings_age_group_check;
alter table public.family_settings
  add constraint family_settings_age_group_check check (age_group in ('7-9','10-11','12-14'));

create table if not exists public.events (
  id         bigint generated always as identity primary key,
  family_id  uuid not null references public.families(id) on delete cascade,
  child_id   uuid not null references public.child_profiles(child_id) on delete cascade,
  session_id text not null check (char_length(session_id) between 8 and 40 and session_id ~ '^[a-z0-9_.-]+$'),
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  ts         timestamptz not null default now(),
  client_ts  timestamptz
);
create index if not exists events_fam_ts on public.events (family_id, ts desc);
create index if not exists events_fam_name on public.events (family_id, name);
create index if not exists events_child_ts on public.events (child_id, ts);

alter table public.events enable row level security;
revoke all on public.events from public, anon, authenticated;

create or replace function public.track_events(p_events jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  cid uuid;
  ev jsonb;
  n text;
  raw jsonb;
  clean jsonb;
  k text;
  val jsonb;
  ok_val boolean;
  accepted int := 0;
  dropped int := 0;
  today_n int := 0;
  i int := 0;
  sid text;
  cts timestamptz;
  names text[] := array[
    'session_started','session_ended','mission_started','scene_shown','scene_completed',
    'scene_skipped_fast','choice_selected','calculation_answered','hint_used',
    'mission_completed','mission_abandoned','debrief_opened','debrief_completed',
    'mission_rating','next_mission_started','blitz_started','blitz_finished',
    'finny_chat_started','finny_voice_started','limit_hit','break_shown','break_accepted',
    'share_clicked','recharge_started'
  ];
  keys text[] := array[
    'mission_id','scene_id','scene_kind','lang','age_group','device_class','app_version',
    'duration_ms','choice_id','correct','attempt','last_scene_id','score','kind','rating'
  ];
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'accepted', 0, 'dropped', 0);
  end if;
  select m.family_id into fid from public.family_members m where m.user_id = uid limit 1;
  select c.child_id into cid from public.child_profiles c where c.child_id = uid;
  if fid is null or cid is null then
    return jsonb_build_object('ok', false, 'accepted', 0, 'dropped', 0);
  end if;
  if jsonb_typeof(p_events) is distinct from 'array' then
    return jsonb_build_object('ok', true, 'accepted', 0, 'dropped', 0);
  end if;

  select count(*)::int into today_n
    from public.events e
    where e.family_id = fid and e.ts >= date_trunc('day', now());

  for ev in select value from jsonb_array_elements(p_events) as t(value)
  loop
    i := i + 1;
    if i > 100 or today_n + accepted >= 1000 then
      dropped := dropped + 1;
      continue;
    end if;
    n := ev->>'name';
    if n is null or not (n = any(names)) then
      dropped := dropped + 1;
      continue;
    end if;
    sid := ev->>'session_id';
    if sid is null or char_length(sid) < 8 or char_length(sid) > 40 or sid !~ '^[a-z0-9_.-]+$' then
      dropped := dropped + 1;
      continue;
    end if;
    raw := coalesce(ev->'props', '{}'::jsonb);
    if jsonb_typeof(raw) is distinct from 'object' then
      dropped := dropped + 1;
      continue;
    end if;
    if exists (
      select 1 from jsonb_object_keys(raw) as ok(key) where not (ok.key = any(keys))
    ) then
      dropped := dropped + 1;
      continue;
    end if;
    clean := '{}'::jsonb;
    ok_val := true;
    for k, val in select * from jsonb_each(raw)
    loop
      if jsonb_typeof(val) = 'number' or jsonb_typeof(val) = 'boolean' then
        clean := clean || jsonb_build_object(k, val);
      elsif jsonb_typeof(val) = 'string' and (val #>> '{}') ~ '^[a-z0-9_.-]{1,40}$' then
        clean := clean || jsonb_build_object(k, val #>> '{}');
      else
        ok_val := false;
        exit;
      end if;
    end loop;
    if not ok_val then
      dropped := dropped + 1;
      continue;
    end if;
    begin
      cts := nullif(ev->>'client_ts', '')::timestamptz;
    exception when others then
      cts := null;
    end;
    insert into public.events (family_id, child_id, session_id, name, props, client_ts)
      values (fid, cid, sid, n, clean, cts);
    accepted := accepted + 1;
  end loop;

  return jsonb_build_object('ok', true, 'accepted', accepted, 'dropped', dropped);
end $$;

revoke all on function public.track_events(jsonb) from public, anon;
grant execute on function public.track_events(jsonb) to authenticated;

-- Представления для владельца (SQL Editor). Клиентам GRANT нет.
create or replace view private.v_mission_funnel as
  select e.props->>'mission_id' as mission_id,
         e.props->>'scene_id' as scene_id,
         count(*)::int as reached
  from public.events e
  where e.name = 'scene_shown'
  group by 1, 2;

create or replace view private.v_mission_dropoff as
  select e.props->>'mission_id' as mission_id,
         e.props->>'last_scene_id' as last_scene_id,
         count(*)::int as abandoned
  from public.events e
  where e.name = 'mission_abandoned'
  group by 1, 2;

create or replace view private.v_scene_median as
  select e.props->>'mission_id' as mission_id,
         e.props->>'scene_id' as scene_id,
         percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric) as median_ms,
         (percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric) > 1800000) as over_30min
  from public.events e
  where e.name = 'scene_completed' and (e.props ? 'duration_ms')
  group by 1, 2;

create or replace view private.v_mission_median as
  select e.props->>'mission_id' as mission_id,
         percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric) as median_ms,
         (percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric) > 1800000) as over_30min
  from public.events e
  where e.name = 'mission_completed' and (e.props ? 'duration_ms')
  group by 1;

create or replace view private.v_calc_accuracy as
  select e.props->>'mission_id' as mission_id,
         e.props->>'scene_id' as scene_id,
         count(*)::int as answers,
         round(100.0 * avg(case when (e.props->>'correct') in ('true','t') then 1 else 0 end), 1) as pct_correct
  from public.events e
  where e.name = 'calculation_answered'
  group by 1, 2;

create or replace view private.v_choice_dist as
  select e.props->>'mission_id' as mission_id,
         e.props->>'scene_id' as scene_id,
         e.props->>'choice_id' as choice_id,
         count(*)::int as n
  from public.events e
  where e.name = 'choice_selected'
  group by 1, 2, 3;

create or replace view private.v_debrief_rate as
  select
    (select count(*) from public.events where name = 'mission_completed')::int as completed,
    (select count(*) from public.events where name = 'debrief_completed')::int as debriefed,
    case when (select count(*) from public.events where name = 'mission_completed') = 0 then null
         else round(100.0 * (select count(*) from public.events where name = 'debrief_completed')
              / (select count(*) from public.events where name = 'mission_completed'), 1) end as pct_debrief;

create or replace view private.v_next_mission_rate as
  select
    (select count(*) from public.events where name = 'mission_completed')::int as completed,
    (select count(*) from public.events where name = 'next_mission_started')::int as next_started,
    case when (select count(*) from public.events where name = 'mission_completed') = 0 then null
         else round(100.0 * (select count(*) from public.events where name = 'next_mission_started')
              / (select count(*) from public.events where name = 'mission_completed'), 1) end as pct_next;

create or replace view private.v_mission_rating as
  select e.props->>'mission_id' as mission_id,
         count(*)::int as n,
         round(avg((e.props->>'rating')::numeric), 2) as avg_rating
  from public.events e
  where e.name = 'mission_rating' and (e.props ? 'rating')
  group by 1;

create or replace view private.v_returns as
  with days as (
    select e.child_id, (e.ts at time zone 'utc')::date as d
    from public.events e
    group by 1, 2
  ),
  firsts as (
    select child_id, min(d) as d0 from days group by 1
  )
  select
    count(*)::int as cohorts,
    count(*) filter (where exists (select 1 from days x where x.child_id = f.child_id and x.d = f.d0 + 1))::int as d1,
    count(*) filter (where exists (select 1 from days x where x.child_id = f.child_id and x.d = f.d0 + 3))::int as d3,
    count(*) filter (where exists (select 1 from days x where x.child_id = f.child_id and x.d = f.d0 + 7))::int as d7
  from firsts f;

create or replace view private.v_feature_usage as
  select
    count(*) filter (where name = 'blitz_started')::int as blitz,
    count(*) filter (where name = 'finny_chat_started')::int as chat,
    count(*) filter (where name = 'finny_voice_started')::int as voice,
    count(*) filter (where name = 'share_clicked')::int as share,
    count(*) filter (where name = 'limit_hit')::int as limit_hit,
    count(*) filter (where name = 'recharge_started')::int as recharge
  from public.events;

create or replace view private.v_by_age_lang as
  select e.props->>'age_group' as age_group,
         e.props->>'lang' as lang,
         count(*) filter (where e.name = 'mission_completed')::int as missions,
         count(*) filter (where e.name = 'blitz_started')::int as blitz,
         count(*) filter (where e.name = 'finny_chat_started')::int as chat,
         count(*) filter (where e.name = 'session_started')::int as sessions,
         round(avg(case when e.name = 'mission_rating' then (e.props->>'rating')::numeric end), 2) as avg_rating
  from public.events e
  group by 1, 2;

revoke all on private.v_mission_funnel, private.v_mission_dropoff, private.v_scene_median,
  private.v_mission_median, private.v_calc_accuracy, private.v_choice_dist, private.v_debrief_rate,
  private.v_next_mission_rate, private.v_mission_rating, private.v_returns, private.v_feature_usage,
  private.v_by_age_lang from public, anon, authenticated;

-- Согласие и возрастная группа без PIN (не денежная настройка).
create or replace function public.family_prefs_set(p_analytics_on boolean, p_age_group text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  fid uuid;
begin
  if uid is null then
    return jsonb_build_object('ok', false);
  end if;
  if p_age_group is null or p_age_group not in ('7-9','10-11','12-14') then
    return jsonb_build_object('ok', false);
  end if;
  select m.family_id into fid from public.family_members m
    where m.user_id = uid and m.role = 'parent' limit 1;
  if fid is null then
    return jsonb_build_object('ok', false);
  end if;
  update public.family_settings
    set analytics_on = coalesce(p_analytics_on, false),
        age_group = p_age_group,
        updated_at = now()
    where family_id = fid;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.family_prefs_set(boolean, text) from public, anon;
grant execute on function public.family_prefs_set(boolean, text) to authenticated;
