-- PIN на сервере, роль торга для одного устройства, family_erase, закрытие INSERT.
-- sha256() уже есть (pgcrypto в проекте).

create table if not exists public.family_pins (
  family_id     uuid primary key references public.families(id) on delete cascade,
  pin_hash      text not null,
  pin_salt      text not null,
  fails         int not null default 0 check (fails >= 0),
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
create table if not exists public.parent_unlocks (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  until    timestamptz not null
);
alter table public.family_pins enable row level security;
alter table public.parent_unlocks enable row level security;
revoke all on public.family_pins, public.parent_unlocks from public, anon, authenticated;

alter table public.family_settings drop column if exists pin_hash;
alter table public.family_settings drop column if exists pin_salt;

-- каскад при удалении пользователя
alter table public.families alter column created_by drop not null;
alter table public.families drop constraint if exists families_created_by_fkey;
alter table public.families add constraint families_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

alter table public.job_events drop constraint if exists job_events_actor_id_fkey;
alter table public.job_events add constraint job_events_actor_id_fkey
  foreign key (actor_id) references auth.users(id) on delete cascade;

alter table public.ledger_entries alter column created_by drop not null;
alter table public.ledger_entries drop constraint if exists ledger_entries_created_by_fkey;
alter table public.ledger_entries add constraint ledger_entries_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

create or replace function public.ledger_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'ledger_entries is append-only';
  end if;
  if tg_op = 'DELETE' and current_setting('app.family_erase', true) is distinct from 'on' then
    raise exception 'ledger_entries is append-only';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.is_family_parent_unlocked(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_family_parent(fid)
     and exists (
       select 1 from parent_unlocks u
       where u.user_id = auth.uid() and u.until > now()
     );
$$;

create or replace function public.pin_digest(p_salt text, p_pin text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(p_salt || p_pin, 'UTF8')), 'hex');
$$;

create or replace function public.pin_format_ok(p_pin text) returns boolean
language sql immutable set search_path = public as $$
  select p_pin is not null and p_pin ~ '^[0-9]{4,8}$';
$$;

create or replace function public.my_family_id() returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from family_members where user_id = auth.uid() limit 1;
$$;

create or replace function public.pin_status() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fid uuid := public.my_family_id();
  p family_pins;
  until_at timestamptz;
begin
  if fid is null then
    return jsonb_build_object('has_pin', false, 'unlocked_until', null, 'locked_until', null);
  end if;
  select * into p from family_pins where family_id = fid;
  select u.until into until_at from parent_unlocks u where u.user_id = auth.uid() and u.until > now();
  return jsonb_build_object(
    'has_pin', p.family_id is not null,
    'unlocked_until', until_at,
    'locked_until', case when p.locked_until is not null and p.locked_until > now() then p.locked_until else null end
  );
end $$;

create or replace function public.pin_register_fail(fid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p family_pins;
begin
  update family_pins set fails = fails + 1, updated_at = now() where family_id = fid returning * into p;
  if p.fails >= 5 then
    update family_pins set fails = 0, locked_until = now() + interval '15 minutes', updated_at = now() where family_id = fid;
  end if;
end $$;

drop function if exists public.pin_set(text, text);
drop function if exists public.pin_unlock(text);

create or replace function public.pin_set(p_new text, p_old text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fid uuid := public.my_family_id();
  p family_pins;
  salt text;
  mins int;
begin
  if fid is null or not public.is_family_parent(fid) then raise exception 'forbidden'; end if;
  if not public.pin_format_ok(p_new) then raise exception 'bad pin format'; end if;
  select * into p from family_pins where family_id = fid;
  if p.family_id is not null then
    if p.locked_until is not null and p.locked_until > now() then
      mins := greatest(1, ceil(extract(epoch from (p.locked_until - now())) / 60.0)::int);
      return jsonb_build_object('ok', false, 'error', 'locked', 'minutes', mins);
    end if;
    if p_old is null or public.pin_digest(p.pin_salt, p_old) <> p.pin_hash then
      perform public.pin_register_fail(fid);
      select * into p from family_pins where family_id = fid;
      if p.locked_until is not null and p.locked_until > now() then
        mins := greatest(1, ceil(extract(epoch from (p.locked_until - now())) / 60.0)::int);
        return jsonb_build_object('ok', false, 'error', 'locked', 'minutes', mins);
      end if;
      return jsonb_build_object('ok', false, 'error', 'bad pin');
    end if;
  end if;
  salt := gen_random_uuid()::text;
  insert into family_pins (family_id, pin_hash, pin_salt, fails, locked_until, updated_at)
    values (fid, public.pin_digest(salt, p_new), salt, 0, null, now())
    on conflict (family_id) do update
      set pin_hash = excluded.pin_hash, pin_salt = excluded.pin_salt, fails = 0, locked_until = null, updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pin_unlock(p_pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fid uuid := public.my_family_id();
  p family_pins;
  until_at timestamptz;
  mins int;
begin
  if fid is null or not public.is_family_parent(fid) then raise exception 'forbidden'; end if;
  if not public.pin_format_ok(p_pin) then raise exception 'bad pin format'; end if;
  select * into p from family_pins where family_id = fid;
  if p.family_id is null then raise exception 'no pin'; end if;
  if p.locked_until is not null and p.locked_until > now() then
    mins := greatest(1, ceil(extract(epoch from (p.locked_until - now())) / 60.0)::int);
    return jsonb_build_object('ok', false, 'error', 'locked', 'minutes', mins);
  end if;
  if public.pin_digest(p.pin_salt, p_pin) <> p.pin_hash then
    perform public.pin_register_fail(fid);
    select * into p from family_pins where family_id = fid;
    if p.locked_until is not null and p.locked_until > now() then
      mins := greatest(1, ceil(extract(epoch from (p.locked_until - now())) / 60.0)::int);
      return jsonb_build_object('ok', false, 'error', 'locked', 'minutes', mins);
    end if;
    return jsonb_build_object('ok', false, 'error', 'bad pin');
  end if;
  update family_pins set fails = 0, locked_until = null, updated_at = now() where family_id = fid;
  until_at := now() + interval '10 minutes';
  insert into parent_unlocks (user_id, until) values (auth.uid(), until_at)
    on conflict (user_id) do update set until = excluded.until;
  return jsonb_build_object('ok', true, 'until', until_at);
end $$;

create or replace function public.pin_lock() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from parent_unlocks where user_id = auth.uid();
end $$;

create or replace function public.job_actor_role(fid uuid, p_child uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when public.is_family_parent_unlocked(fid) then 'parent'
    when p_child = auth.uid() then 'child'
    when public.is_family_parent(fid) then 'parent'
    else null
  end;
$$;

create or replace function public.job_create_by_parent(p_child uuid, p_title text, p_done_when text, p_price_agorot bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare cp child_profiles; jid uuid;
begin
  select * into cp from child_profiles where child_id = p_child;
  if cp.child_id is null or not public.is_family_parent_unlocked(cp.family_id) then raise exception 'forbidden'; end if;
  insert into jobs (family_id, child_id, title, done_when, price_agorot, turn)
    values (cp.family_id, cp.child_id, left(trim(p_title),60), left(coalesce(p_done_when,''),120), p_price_agorot, 'child')
    returning id into jid;
  insert into job_events (job_id, actor_id, actor_role, kind, price_agorot) values (jid, auth.uid(), 'parent', 'propose', p_price_agorot);
  return jid;
end $$;

create or replace function public.job_negotiate(p_job uuid, p_move text, p_price_agorot bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare j jobs; who text; counters int;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null then raise exception 'not found'; end if;
  who := public.job_actor_role(j.family_id, j.child_id);
  if who is null then raise exception 'forbidden'; end if;
  if j.status <> 'negotiating' or j.turn <> who then raise exception 'not your turn'; end if;
  if p_move = 'accept' then
    update jobs set status='agreed', updated_at=now() where id = j.id;
    insert into job_events (job_id, actor_id, actor_role, kind, price_agorot) values (j.id, auth.uid(), who, 'accept', j.price_agorot);
  elsif p_move = 'decline' then
    update jobs set status='closed', updated_at=now() where id = j.id;
    insert into job_events (job_id, actor_id, actor_role, kind) values (j.id, auth.uid(), who, 'close');
  elsif p_move = 'counter' then
    select count(*) into counters from job_events where job_id = j.id and kind = 'counter';
    if counters >= 4 then raise exception 'negotiation limit'; end if;
    if p_price_agorot is null or p_price_agorot < 100 or p_price_agorot > 50000 then raise exception 'bad price'; end if;
    update jobs set price_agorot = p_price_agorot, turn = case who when 'child' then 'parent' else 'child' end, updated_at = now() where id = j.id;
    insert into job_events (job_id, actor_id, actor_role, kind, price_agorot) values (j.id, auth.uid(), who, 'counter', p_price_agorot);
  else
    raise exception 'bad move';
  end if;
end $$;

create or replace function public.job_confirm(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs; pct int; bonus bigint;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null or not public.is_family_parent_unlocked(j.family_id) or j.status <> 'claimed' then raise exception 'forbidden'; end if;
  select match_pct into pct from family_settings where family_id = j.family_id;
  insert into ledger_entries (family_id, child_id, kind, amount_agorot, note, job_id, created_by)
    values (j.family_id, j.child_id, 'job', j.price_agorot, left(j.title,80), j.id, auth.uid());
  bonus := round(j.price_agorot * coalesce(pct,0) / 100.0);
  if coalesce(pct,0) > 0 and bonus > 0 then
    insert into ledger_entries (family_id, child_id, kind, amount_agorot, note, job_id, created_by)
      values (j.family_id, j.child_id, 'match', bonus, left('+'||pct||'% · '||j.title,80), j.id, auth.uid());
  end if;
  update jobs set status='paid', updated_at=now() where id = j.id;
  insert into job_events (job_id, actor_id, actor_role, kind, price_agorot) values (j.id, auth.uid(), 'parent', 'confirm', j.price_agorot);
end $$;

create or replace function public.job_return(p_job uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null or not public.is_family_parent_unlocked(j.family_id) or j.status <> 'claimed' then raise exception 'forbidden'; end if;
  update jobs set status='agreed', updated_at=now() where id = j.id;
  insert into job_events (job_id, actor_id, actor_role, kind, note) values (j.id, auth.uid(), 'parent', 'return', left(p_note,200));
end $$;

create or replace function public.ledger_add(p_child uuid, p_kind text, p_amount_agorot bigint, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare cp child_profiles;
begin
  select * into cp from child_profiles where child_id = p_child;
  if cp.child_id is null or not public.is_family_parent_unlocked(cp.family_id) then raise exception 'forbidden'; end if;
  if p_kind not in ('payout','adjust') then raise exception 'bad kind'; end if;
  insert into ledger_entries (family_id, child_id, kind, amount_agorot, note, created_by)
    values (cp.family_id, cp.child_id, p_kind, case when p_kind='payout' then -abs(p_amount_agorot) else p_amount_agorot end, left(coalesce(p_note,''),80), auth.uid());
end $$;

create or replace function public.bridge_add_game(p_child uuid, p_game integer default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  ws date := date_trunc('week', now())::date;
  bal int := 0;
  already int := 0;
  inc int := 0;
begin
  if p_child <> auth.uid() then raise exception 'forbidden'; end if;
  if not exists (select 1 from child_profiles where child_id = p_child) then raise exception 'forbidden'; end if;
  select game_balance into bal from game_state where child_id = p_child;
  bal := coalesce(bal, 0);
  select coalesce(sum(game_earned), 0) into already from bridge_weeks where child_id = p_child;
  inc := greatest(0, bal - already);
  if inc <= 0 then return; end if;
  insert into bridge_weeks (child_id, week_start, game_earned) values (p_child, ws, inc)
    on conflict (child_id, week_start) do update set game_earned = bridge_weeks.game_earned + inc;
end $$;

create or replace function public.bridge_apply(p_child uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare cp child_profiles; st family_settings; bw bridge_weeks; ws date := date_trunc('week', now())::date; amt bigint;
begin
  select * into cp from child_profiles where child_id = p_child;
  if cp.child_id is null or not public.is_family_parent_unlocked(cp.family_id) then raise exception 'forbidden'; end if;
  select * into st from family_settings where family_id = cp.family_id;
  if st.family_id is null or st.bridge_rate_agorot <= 0 or st.bridge_weekly_cap_agorot <= 0 then return 0; end if;
  select * into bw from bridge_weeks where child_id = p_child and week_start = ws for update;
  if bw.child_id is null then return 0; end if;
  amt := least(bw.game_earned * st.bridge_rate_agorot - bw.bridged_agorot, st.bridge_weekly_cap_agorot - bw.bridged_agorot);
  if amt <= 0 then return 0; end if;
  update bridge_weeks set bridged_agorot = bridged_agorot + amt where child_id = p_child and week_start = ws;
  insert into ledger_entries (family_id, child_id, kind, amount_agorot, note, created_by)
    values (cp.family_id, cp.child_id, 'bridge', amt, left(bw.game_earned||' game ₪ × '||st.bridge_rate_agorot||' agorot',80), auth.uid());
  return amt;
end $$;

create or replace function public.job_close(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs; who text;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null then raise exception 'not found'; end if;
  who := public.job_actor_role(j.family_id, j.child_id);
  if who is null then raise exception 'forbidden'; end if;
  if j.status not in ('negotiating','agreed') then raise exception 'forbidden'; end if;
  update jobs set status='closed', updated_at=now() where id = j.id;
  insert into job_events (job_id, actor_id, actor_role, kind) values (j.id, auth.uid(), who, 'close');
end $$;

create or replace function public.family_erase() returns void
language plpgsql security definer set search_path = public as $$
declare fid uuid := public.my_family_id();
begin
  if fid is null or not public.is_family_parent_unlocked(fid) then raise exception 'forbidden'; end if;
  perform set_config('app.family_erase', 'on', true);
  delete from ledger_entries where family_id = fid;
  delete from parent_unlocks where user_id in (select user_id from family_members where family_id = fid);
  delete from families where id = fid;
end $$;

drop policy if exists fam_insert on public.families;
drop policy if exists fam_update on public.families;
drop policy if exists mem_parent on public.family_members;
drop policy if exists cp_parent on public.child_profiles;
drop policy if exists fs_parent on public.family_settings;

create policy fam_update on public.families for update using (is_family_parent_unlocked(id));
create policy cp_update on public.child_profiles for update using (child_id = auth.uid()) with check (child_id = auth.uid());
create policy fs_select on public.family_settings for select using (is_family_parent(family_id));
create policy fs_update on public.family_settings for update using (is_family_parent_unlocked(family_id)) with check (is_family_parent_unlocked(family_id));

revoke insert, delete on public.families, public.family_members, public.child_profiles, public.family_settings from authenticated;
grant select, update on public.families, public.child_profiles, public.family_settings to authenticated;
grant select on public.family_members to authenticated;

revoke all on function public.pin_digest(text,text), public.pin_register_fail(uuid), public.pin_format_ok(text),
  public.job_actor_role(uuid,uuid), public.my_family_id()
  from public, anon, authenticated;
revoke all on function public.is_family_parent_unlocked(uuid), public.is_family_member(uuid), public.is_family_parent(uuid) from public, anon;
grant execute on function public.is_family_parent_unlocked(uuid), public.is_family_member(uuid), public.is_family_parent(uuid) to authenticated;
revoke all on function public.pin_status(), public.pin_set(text,text), public.pin_unlock(text), public.pin_lock(),
  public.family_erase(), public.bridge_add_game(uuid,integer)
  from public, anon;
grant execute on function public.pin_status(), public.pin_set(text,text), public.pin_unlock(text), public.pin_lock(),
  public.family_erase(), public.bridge_add_game(uuid,integer)
  to authenticated;
