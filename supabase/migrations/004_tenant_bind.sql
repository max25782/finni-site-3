-- family_id на строках ребёнка: триггер подставляет семью из child_profiles.
-- Награда миссии — из private.mission_catalog, не с клиента.

alter table public.game_state add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.mission_completions add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.dreams add column if not exists family_id uuid references public.families(id) on delete cascade;

update public.game_state g set family_id = c.family_id
  from public.child_profiles c where c.child_id = g.child_id and g.family_id is null;
update public.mission_completions m set family_id = c.family_id
  from public.child_profiles c where c.child_id = m.child_id and m.family_id is null;
update public.dreams d set family_id = c.family_id
  from public.child_profiles c where c.child_id = d.child_id and d.family_id is null;

alter table public.game_state alter column family_id set not null;
alter table public.mission_completions alter column family_id set not null;
alter table public.dreams alter column family_id set not null;
alter table public.mission_completions alter column xp_earned set default 0;
alter table public.mission_completions alter column game_gain set default 0;

create or replace function private.my_child_family() returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from child_profiles where child_id = auth.uid();
$$;
revoke all on function private.my_child_family() from public, anon;
grant execute on function private.my_child_family() to authenticated;

create table if not exists private.mission_catalog (
  id        text primary key,
  xp        integer not null check (xp >= 0),
  game_gain integer not null check (game_gain >= 0)
);
insert into private.mission_catalog (id, xp, game_gain) values
  ('bracelets', 30, 50),
  ('month', 30, 100),
  ('kiosk', 30, 40),
  ('detective', 30, 50),
  ('channel', 30, 80),
  ('attention', 30, 40),
  ('inflation', 30, 50),
  ('job', 30, 40),
  ('bigbuy', 30, 40),
  ('family', 30, 40),
  ('giving', 30, 35),
  ('island', 30, 60),
  ('negotiator', 30, 50),
  ('finale', 30, 80)
on conflict (id) do update set xp = excluded.xp, game_gain = excluded.game_gain;
revoke all on table private.mission_catalog from public, anon, authenticated;

create or replace function private.bind_child_tenant() returns trigger
language plpgsql security definer set search_path = public as $$
declare fid uuid; cat private.mission_catalog;
begin
  if auth.uid() is not null then
    new.child_id := auth.uid();
  end if;
  select c.family_id into fid from child_profiles c where c.child_id = new.child_id;
  if fid is null then raise exception 'no child profile'; end if;
  new.family_id := fid;
  if tg_table_name = 'mission_completions' then
    select * into cat from private.mission_catalog where id = new.mission_id;
    if cat.id is null then raise exception 'unknown mission'; end if;
    new.xp_earned := cat.xp;
    new.game_gain := cat.game_gain;
  end if;
  return new;
end $$;
revoke all on function private.bind_child_tenant() from public, anon, authenticated;

drop trigger if exists gs_bind_family on public.game_state;
drop trigger if exists mc_bind_family on public.mission_completions;
drop trigger if exists dr_bind_family on public.dreams;
create trigger gs_bind_family before insert or update on public.game_state
  for each row execute function private.bind_child_tenant();
create trigger mc_bind_family before insert or update on public.mission_completions
  for each row execute function private.bind_child_tenant();
create trigger dr_bind_family before insert or update on public.dreams
  for each row execute function private.bind_child_tenant();

drop policy if exists gs_child on public.game_state;
drop policy if exists mc_insert on public.mission_completions;
drop policy if exists dr_child on public.dreams;

create policy gs_child on public.game_state for all
  using (child_id = auth.uid() and family_id = private.my_child_family())
  with check (child_id = auth.uid() and family_id = private.my_child_family());
create policy mc_insert on public.mission_completions for insert
  with check (child_id = auth.uid() and family_id = private.my_child_family());
create policy dr_child on public.dreams for all
  using (child_id = auth.uid() and family_id = private.my_child_family())
  with check (child_id = auth.uid() and family_id = private.my_child_family());
