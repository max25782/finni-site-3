-- Хелперы ролей в схеме private (вне Data API). ledger_immutable: search_path = ''.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public;

create or replace function private.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;
create or replace function private.is_family_parent(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid() and role = 'parent');
$$;
create or replace function private.is_family_parent_unlocked(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_family_parent(fid)
     and exists (
       select 1 from parent_unlocks u
       where u.user_id = auth.uid() and u.until > now()
     );
$$;

revoke all on function private.is_family_member(uuid), private.is_family_parent(uuid), private.is_family_parent_unlocked(uuid) from public, anon;
grant execute on function private.is_family_member(uuid), private.is_family_parent(uuid), private.is_family_parent_unlocked(uuid) to authenticated;

create or replace function public.pin_set(p_new text, p_old text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  fid uuid := public.my_family_id();
  p family_pins;
  salt text;
  mins int;
begin
  if fid is null or not private.is_family_parent(fid) then raise exception 'forbidden'; end if;
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
  if fid is null or not private.is_family_parent(fid) then raise exception 'forbidden'; end if;
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

create or replace function public.job_actor_role(fid uuid, p_child uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when private.is_family_parent_unlocked(fid) then 'parent'
    when p_child = auth.uid() then 'child'
    when private.is_family_parent(fid) then 'parent'
    else null
  end;
$$;

create or replace function public.job_create_by_parent(p_child uuid, p_title text, p_done_when text, p_price_agorot bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare cp child_profiles; jid uuid;
begin
  select * into cp from child_profiles where child_id = p_child;
  if cp.child_id is null or not private.is_family_parent_unlocked(cp.family_id) then raise exception 'forbidden'; end if;
  insert into jobs (family_id, child_id, title, done_when, price_agorot, turn)
    values (cp.family_id, cp.child_id, left(trim(p_title),60), left(coalesce(p_done_when,''),120), p_price_agorot, 'child')
    returning id into jid;
  insert into job_events (job_id, actor_id, actor_role, kind, price_agorot) values (jid, auth.uid(), 'parent', 'propose', p_price_agorot);
  return jid;
end $$;

create or replace function public.job_confirm(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs; pct int; bonus bigint;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null or not private.is_family_parent_unlocked(j.family_id) or j.status <> 'claimed' then raise exception 'forbidden'; end if;
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
  if j.id is null or not private.is_family_parent_unlocked(j.family_id) or j.status <> 'claimed' then raise exception 'forbidden'; end if;
  update jobs set status='agreed', updated_at=now() where id = j.id;
  insert into job_events (job_id, actor_id, actor_role, kind, note) values (j.id, auth.uid(), 'parent', 'return', left(p_note,200));
end $$;

create or replace function public.ledger_add(p_child uuid, p_kind text, p_amount_agorot bigint, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare cp child_profiles;
begin
  select * into cp from child_profiles where child_id = p_child;
  if cp.child_id is null or not private.is_family_parent_unlocked(cp.family_id) then raise exception 'forbidden'; end if;
  if p_kind not in ('payout','adjust') then raise exception 'bad kind'; end if;
  insert into ledger_entries (family_id, child_id, kind, amount_agorot, note, created_by)
    values (cp.family_id, cp.child_id, p_kind, case when p_kind='payout' then -abs(p_amount_agorot) else p_amount_agorot end, left(coalesce(p_note,''),80), auth.uid());
end $$;

create or replace function public.bridge_apply(p_child uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare cp child_profiles; st family_settings; bw bridge_weeks; ws date := date_trunc('week', now())::date; amt bigint;
begin
  select * into cp from child_profiles where child_id = p_child;
  if cp.child_id is null or not private.is_family_parent_unlocked(cp.family_id) then raise exception 'forbidden'; end if;
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

create or replace function public.family_erase() returns void
language plpgsql security definer set search_path = public as $$
declare fid uuid := public.my_family_id();
begin
  if fid is null or not private.is_family_parent_unlocked(fid) then raise exception 'forbidden'; end if;
  perform set_config('app.family_erase', 'on', true);
  delete from ledger_entries where family_id = fid;
  delete from parent_unlocks where user_id in (select user_id from family_members where family_id = fid);
  delete from families where id = fid;
end $$;

create or replace function public.ledger_immutable() returns trigger
language plpgsql set search_path = '' as $$
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

drop policy if exists fam_select on public.families;
drop policy if exists fam_update on public.families;
drop policy if exists mem_select on public.family_members;
drop policy if exists cp_select on public.child_profiles;
drop policy if exists gs_select on public.game_state;
drop policy if exists mc_select on public.mission_completions;
drop policy if exists dr_select on public.dreams;
drop policy if exists fs_select on public.family_settings;
drop policy if exists fs_update on public.family_settings;
drop policy if exists jobs_select on public.jobs;
drop policy if exists je_select on public.job_events;
drop policy if exists le_select on public.ledger_entries;
drop policy if exists bw_select on public.bridge_weeks;
drop policy if exists ud_select on public.usage_daily;

create policy fam_select  on public.families       for select using (private.is_family_member(id));
create policy fam_update  on public.families       for update using (private.is_family_parent_unlocked(id));
create policy mem_select  on public.family_members for select using (private.is_family_member(family_id));
create policy cp_select on public.child_profiles for select using (child_id = auth.uid() or private.is_family_parent(family_id));
create policy gs_select on public.game_state for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = game_state.child_id and private.is_family_parent(c.family_id)));
create policy mc_select on public.mission_completions for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = mission_completions.child_id and private.is_family_parent(c.family_id)));
create policy dr_select on public.dreams for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = dreams.child_id and private.is_family_parent(c.family_id)));
create policy fs_select on public.family_settings for select using (private.is_family_parent(family_id));
create policy fs_update on public.family_settings for update using (private.is_family_parent_unlocked(family_id)) with check (private.is_family_parent_unlocked(family_id));
create policy jobs_select on public.jobs       for select using (child_id = auth.uid() or private.is_family_parent(family_id));
create policy je_select   on public.job_events for select using (exists (select 1 from jobs j where j.id = job_events.job_id and (j.child_id = auth.uid() or private.is_family_parent(j.family_id))));
create policy le_select on public.ledger_entries for select using (child_id = auth.uid() or private.is_family_parent(family_id));
create policy bw_select on public.bridge_weeks for select using (private.is_family_parent((select family_id from child_profiles c where c.child_id = bridge_weeks.child_id)));
create policy ud_select on public.usage_daily  for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = usage_daily.child_id and private.is_family_parent(c.family_id)));

drop function if exists public.is_family_parent_unlocked(uuid);
drop function if exists public.is_family_parent(uuid);
drop function if exists public.is_family_member(uuid);
