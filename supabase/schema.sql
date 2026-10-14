-- ============================================================================
-- Финни: схема Supabase (Postgres 15+).  Проект finni, eu-west-1.
-- Сайт подключается при входе родителя; без входа прогресс остаётся в localStorage.
--
-- Модель «одно устройство»:
--  * family_init создаёт семью, роль parent и профиль ребёнка на одном auth.uid().
--  * Тот же аккаунт играет и ребёнка, и родителя. Роль в торге:
--      разблокирован PIN → parent; иначе, если есть child_profile → child;
--      отдельный аккаунт-родитель без профиля ребёнка → parent.
--  * Родительские действия с деньгами и настройками требуют серверной
--    разблокировки PIN (parent_unlocks, 10 минут). PIN в интерфейсе недостаточен.
--
-- Принципы:
--  * Деньги — в агоротах (bigint). Журнал: клиентам UPDATE запрещён триггером;
--    DELETE клиентам закрыт (REVOKE + RLS). Каскад и family_erase могут стереть.
--    Прямой INSERT запрещён; записи создают только security definer.
--  * PIN: таблица family_pins (без RLS-политик и без GRANT клиентам).
--    Хэш sha256(salt || pin), salt = gen_random_uuid()::text. 4–8 цифр.
--    5 неудач → locked_until = now()+15 мин. Разблокировка 10 минут.
--  * Хелперы ролей (is_family_*) в схеме private — не в Data API.
--    USAGE на private только у authenticated. Политики и RPC зовут private.*.
--  * families / family_members / child_profiles: клиентский INSERT закрыт
--    (нет политик, REVOKE). Создаёт только family_init.
--  * game_state / mission_completions / dreams: family_id ставит триггер из
--    child_profiles (присланный family_id игнорируется). WITH CHECK сверяет семью.
--  * Награда в mission_completions — из private.mission_catalog по mission_id,
--    не из полей клиента. Неизвестный id — ошибка.
--  * bridge_add_game считает прирост из game_state.game_balance, число с клиента игнорируется.
--  * Платежей нет: журнал — учёт обещаний родителя.
--  * Личные данные ребёнка минимальны: имя/ник, язык, герой.
--  * Аналитика: public.events + track_events. Клиентам нет SELECT/INSERT.
--    Возраст — группа 7-9 / 10-11 / 12-14, без даты рождения. Срок 12 месяцев.
-- ============================================================================

-- sha256() — из pgcrypto (в проекте Supabase уже включено). Без новых расширений.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public;

-- ───────────── Семьи и участники ─────────────
create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Семья' check (char_length(name) between 1 and 60),
  created_by  uuid references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.family_members (
  family_id   uuid not null references public.families(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('parent','child')),
  display_name text not null default '' check (char_length(display_name) <= 40),
  created_at  timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index on public.family_members (user_id);

create or replace function private.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;
create or replace function private.is_family_parent(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid() and role = 'parent');
$$;

-- ───────────── Профиль ребёнка и состояние игры ─────────────
create table public.child_profiles (
  child_id    uuid primary key references auth.users(id) on delete cascade,
  family_id   uuid not null references public.families(id) on delete cascade,
  lang        text not null default 'ru' check (lang in ('ru','he')),
  hero        text not null default 'girl' check (hero in ('girl','boy')),
  created_at  timestamptz not null default now()
);
create index on public.child_profiles (family_id);

create table public.game_state (
  child_id        uuid primary key references public.child_profiles(child_id) on delete cascade,
  family_id       uuid not null references public.families(id) on delete cascade,
  xp              integer not null default 0 check (xp >= 0),
  game_balance    integer not null default 0 check (game_balance >= 0),
  badges          text[]  not null default '{}',
  streak          integer not null default 0 check (streak >= 0),
  last_day        date,
  missions_done   text[]  not null default '{}',
  active_run      jsonb,
  idea_streak     integer not null default 0 check (idea_streak >= 0),
  idea_last_day   date,
  ideas_seen      text[]  not null default '{}',
  updated_at      timestamptz not null default now()
);

create table public.mission_completions (
  id            bigint generated always as identity primary key,
  child_id      uuid not null references public.child_profiles(child_id) on delete cascade,
  family_id     uuid not null references public.families(id) on delete cascade,
  mission_id    text not null,
  xp_earned     integer not null default 0 check (xp_earned >= 0),
  game_gain     integer not null default 0 check (game_gain >= 0),
  completed_at  timestamptz not null default now(),
  run_log       jsonb
);
create index on public.mission_completions (child_id, completed_at desc);

-- ───────────── Мечта ─────────────
create table public.dreams (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references public.child_profiles(child_id) on delete cascade,
  family_id     uuid not null references public.families(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 40),
  price_agorot  bigint not null check (price_agorot between 1000 and 10000000),
  game_saved    integer not null default 0 check (game_saved >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  achieved_at   timestamptz
);
create unique index dreams_one_active on public.dreams (child_id) where active;

-- ───────────── Настройки родителей (без секретов PIN) ─────────────
create table public.family_settings (
  family_id           uuid primary key references public.families(id) on delete cascade,
  bridge_rate_agorot  integer not null default 0 check (bridge_rate_agorot between 0 and 100),
  bridge_weekly_cap_agorot bigint not null default 0 check (bridge_weekly_cap_agorot between 0 and 10000000),
  match_pct           integer not null default 0 check (match_pct in (0,10,25,50,100)),
  share_enabled       boolean not null default true,
  share_name          boolean not null default false,
  voice_input         boolean not null default false,
  arena_rounds_per_day integer not null default 4 check (arena_rounds_per_day between 0 and 20),
  missions_per_day    integer not null default 1 check (missions_per_day between 1 and 5),
  analytics_on        boolean not null default false,
  age_group           text not null default '10-11' check (age_group in ('7-9','10-11','12-14')),
  updated_at          timestamptz not null default now()
);

-- PIN: клиентам ни SELECT, ни GRANT. Только security definer.
create table public.family_pins (
  family_id     uuid primary key references public.families(id) on delete cascade,
  pin_hash      text not null,
  pin_salt      text not null,
  fails         int not null default 0 check (fails >= 0),
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
create table public.parent_unlocks (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  until    timestamptz not null
);

create or replace function private.is_family_parent_unlocked(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_family_parent(fid)
     and exists (
       select 1 from parent_unlocks u
       where u.user_id = auth.uid() and u.until > now()
     );
$$;

create or replace function private.my_child_family() returns uuid
language sql stable security definer set search_path = public as $$
  select family_id from child_profiles where child_id = auth.uid();
$$;

-- Награда за миссию: только каталог. Клиентские xp_earned / game_gain игнорируются.
create table private.mission_catalog (
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
  ('finale', 30, 80);
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

create trigger gs_bind_family before insert or update on public.game_state
  for each row execute function private.bind_child_tenant();
create trigger mc_bind_family before insert or update on public.mission_completions
  for each row execute function private.bind_child_tenant();
create trigger dr_bind_family before insert or update on public.dreams
  for each row execute function private.bind_child_tenant();

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

-- Ошибки bad pin / locked возвращаем jsonb (не RAISE): иначе UPDATE fails откатится вместе с исключением.
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

create or replace function public.pin_lock() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from parent_unlocks where user_id = auth.uid();
end $$;

-- ───────────── Заказы (дела дома) и торг ─────────────
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  child_id      uuid not null references public.child_profiles(child_id) on delete cascade,
  title         text not null check (char_length(title) between 3 and 60),
  done_when     text not null default '' check (char_length(done_when) <= 120),
  price_agorot  bigint not null check (price_agorot between 100 and 50000),
  turn          text not null check (turn in ('parent','child')),
  status        text not null default 'negotiating' check (status in ('negotiating','agreed','claimed','paid','closed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.jobs (family_id, status);
create index on public.jobs (child_id, status);

create table public.job_events (
  id            bigint generated always as identity primary key,
  job_id        uuid not null references public.jobs(id) on delete cascade,
  actor_id      uuid not null references auth.users(id) on delete cascade,
  actor_role    text not null check (actor_role in ('parent','child')),
  kind          text not null check (kind in ('propose','counter','accept','claim','return','confirm','close')),
  price_agorot  bigint,
  note          text check (char_length(note) <= 200),
  created_at    timestamptz not null default now()
);
create index on public.job_events (job_id, id);

-- ───────────── Журнал реальных денег ─────────────
create table public.ledger_entries (
  id            bigint generated always as identity primary key,
  family_id     uuid not null references public.families(id) on delete cascade,
  child_id      uuid not null references public.child_profiles(child_id) on delete cascade,
  kind          text not null check (kind in ('job','match','bridge','payout','adjust')),
  amount_agorot bigint not null check (amount_agorot <> 0),
  note          text not null default '' check (char_length(note) <= 80),
  job_id        uuid references public.jobs(id) on delete set null,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint ledger_sign check (
    (kind in ('job','match','bridge') and amount_agorot > 0)
    or (kind = 'payout' and amount_agorot < 0)
    or (kind = 'adjust')
  ),
  constraint ledger_job_ref check (kind not in ('job','match') or job_id is not null)
);
create unique index ledger_one_job_payment  on public.ledger_entries (job_id) where kind = 'job';
create unique index ledger_one_match        on public.ledger_entries (job_id) where kind = 'match';
create index on public.ledger_entries (child_id, created_at desc);

-- Клиентам UPDATE закрыт. DELETE разрешён только владельцу/definer (каскад, family_erase).
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
create trigger ledger_no_update before update or delete on public.ledger_entries
  for each row execute function public.ledger_immutable();
create trigger ledger_no_truncate before truncate on public.ledger_entries
  for each statement execute function public.ledger_immutable();

create table public.bridge_weeks (
  child_id        uuid not null references public.child_profiles(child_id) on delete cascade,
  week_start      date not null,
  game_earned     integer not null default 0 check (game_earned >= 0),
  bridged_agorot  bigint  not null default 0 check (bridged_agorot >= 0),
  primary key (child_id, week_start)
);

create table public.usage_daily (
  child_id  uuid not null references public.child_profiles(child_id) on delete cascade,
  day       date not null,
  kind      text not null check (kind in ('chat','arena','blitz','mission')),
  count     integer not null default 0 check (count >= 0),
  primary key (child_id, day, kind)
);

-- Роль в торге для одного uid: PIN-разблокировка = parent, иначе ребёнок если это его профиль.
create or replace function public.job_actor_role(fid uuid, p_child uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when private.is_family_parent_unlocked(fid) then 'parent'
    when p_child = auth.uid() then 'child'
    when private.is_family_parent(fid) then 'parent'
    else null
  end;
$$;

create or replace function public.job_propose(p_title text, p_done_when text, p_price_agorot bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare cp child_profiles; jid uuid;
begin
  select * into cp from child_profiles where child_id = auth.uid();
  if cp.child_id is null then raise exception 'not a child'; end if;
  if (select count(*) from jobs where child_id = cp.child_id and status in ('negotiating','agreed','claimed')) >= 5 then
    raise exception 'too many open jobs';
  end if;
  insert into jobs (family_id, child_id, title, done_when, price_agorot, turn)
    values (cp.family_id, cp.child_id, left(trim(p_title),60), left(coalesce(p_done_when,''),120), p_price_agorot, 'parent')
    returning id into jid;
  insert into job_events (job_id, actor_id, actor_role, kind, price_agorot) values (jid, auth.uid(), 'child', 'propose', p_price_agorot);
  return jid;
end $$;

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

create or replace function public.job_claim(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null or j.child_id <> auth.uid() or j.status <> 'agreed' then raise exception 'forbidden'; end if;
  update jobs set status='claimed', updated_at=now() where id = j.id;
  insert into job_events (job_id, actor_id, actor_role, kind) values (j.id, auth.uid(), 'child', 'claim');
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

-- p_game игнорируется: прирост = game_balance − сумма уже учтённых недель.
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

-- Стереть данные семьи (журнал, заказы, прогресс). Аккаунт auth остаётся.
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

create or replace function public.family_init(p_lang text default 'he', p_display text default '')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  fid uuid;
  mem public.family_members;
  lang text;
begin
  if uid is null then raise exception 'not signed in'; end if;
  lang := case when p_lang in ('ru','he') then p_lang else 'he' end;
  select * into mem from public.family_members where user_id = uid limit 1;
  if mem.user_id is not null then
    insert into public.child_profiles (child_id, family_id, lang) values (uid, mem.family_id, lang) on conflict (child_id) do nothing;
    insert into public.game_state (child_id) values (uid) on conflict do nothing;
    insert into public.family_settings (family_id) values (mem.family_id) on conflict do nothing;
    return jsonb_build_object('family_id', mem.family_id, 'child_id', uid, 'role', mem.role);
  end if;
  insert into public.families (name, created_by) values (left(coalesce(nullif(trim(p_display), ''), 'משפחה'), 60), uid) returning id into fid;
  insert into public.family_members (family_id, user_id, role, display_name) values (fid, uid, 'parent', left(coalesce(p_display, ''), 40));
  insert into public.family_settings (family_id) values (fid);
  insert into public.child_profiles (child_id, family_id, lang) values (uid, fid, lang);
  insert into public.game_state (child_id) values (uid);
  return jsonb_build_object('family_id', fid, 'child_id', uid, 'role', 'parent');
end $$;

-- ───────────── Row Level Security ─────────────
alter table public.families            enable row level security;
alter table public.family_members      enable row level security;
alter table public.child_profiles      enable row level security;
alter table public.game_state          enable row level security;
alter table public.mission_completions enable row level security;
alter table public.dreams              enable row level security;
alter table public.family_settings     enable row level security;
alter table public.family_pins         enable row level security;
alter table public.parent_unlocks      enable row level security;
alter table public.jobs                enable row level security;
alter table public.job_events          enable row level security;
alter table public.ledger_entries      enable row level security;
alter table public.bridge_weeks        enable row level security;
alter table public.usage_daily         enable row level security;

create policy fam_select  on public.families       for select using (private.is_family_member(id));
create policy fam_update  on public.families       for update using (private.is_family_parent_unlocked(id));
create policy mem_select  on public.family_members for select using (private.is_family_member(family_id));

create policy cp_select on public.child_profiles for select using (child_id = auth.uid() or private.is_family_parent(family_id));
create policy cp_update on public.child_profiles for update using (child_id = auth.uid()) with check (child_id = auth.uid());
create policy gs_select on public.game_state for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = game_state.child_id and private.is_family_parent(c.family_id)));
create policy gs_child  on public.game_state for all
  using (child_id = auth.uid() and family_id = private.my_child_family())
  with check (child_id = auth.uid() and family_id = private.my_child_family());
create policy mc_select on public.mission_completions for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = mission_completions.child_id and private.is_family_parent(c.family_id)));
create policy mc_insert on public.mission_completions for insert
  with check (child_id = auth.uid() and family_id = private.my_child_family());
create policy dr_select on public.dreams for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = dreams.child_id and private.is_family_parent(c.family_id)));
create policy dr_child  on public.dreams for all
  using (child_id = auth.uid() and family_id = private.my_child_family())
  with check (child_id = auth.uid() and family_id = private.my_child_family());

create policy fs_select on public.family_settings for select using (private.is_family_parent(family_id));
create policy fs_update on public.family_settings for update using (private.is_family_parent_unlocked(family_id)) with check (private.is_family_parent_unlocked(family_id));

create policy jobs_select on public.jobs       for select using (child_id = auth.uid() or private.is_family_parent(family_id));
create policy je_select   on public.job_events for select using (exists (select 1 from jobs j where j.id = job_events.job_id and (j.child_id = auth.uid() or private.is_family_parent(j.family_id))));
create policy le_select on public.ledger_entries for select using (child_id = auth.uid() or private.is_family_parent(family_id));
create policy bw_select on public.bridge_weeks for select using (private.is_family_parent((select family_id from child_profiles c where c.child_id = bridge_weeks.child_id)));
create policy ud_select on public.usage_daily  for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = usage_daily.child_id and private.is_family_parent(c.family_id)));

revoke all on public.family_pins, public.parent_unlocks from public, anon, authenticated;
revoke insert, update, delete, truncate on public.jobs, public.job_events, public.ledger_entries, public.bridge_weeks from anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on public.jobs, public.job_events, public.ledger_entries, public.bridge_weeks to authenticated;
grant select, update on public.families, public.child_profiles, public.family_settings to authenticated;
grant select on public.family_members to authenticated;
grant select, insert, update, delete on public.game_state, public.dreams to authenticated;
grant select, insert on public.mission_completions to authenticated;
grant select on public.usage_daily to authenticated;
grant usage on all sequences in schema public to authenticated;

revoke all on function public.pin_digest(text,text), public.pin_register_fail(uuid), public.pin_format_ok(text),
  public.job_actor_role(uuid,uuid), public.my_family_id()
  from public, anon, authenticated;
revoke all on function private.is_family_member(uuid), private.is_family_parent(uuid), private.is_family_parent_unlocked(uuid), private.my_child_family() from public, anon;
grant execute on function private.is_family_member(uuid), private.is_family_parent(uuid), private.is_family_parent_unlocked(uuid), private.my_child_family() to authenticated;
revoke all on function public.job_propose(text,text,bigint), public.job_create_by_parent(uuid,text,text,bigint),
  public.job_negotiate(uuid,text,bigint), public.job_claim(uuid), public.job_confirm(uuid), public.job_return(uuid,text),
  public.ledger_add(uuid,text,bigint,text), public.bridge_add_game(uuid,integer), public.bridge_apply(uuid),
  public.job_close(uuid), public.family_init(text,text), public.family_erase(),
  public.pin_status(), public.pin_set(text,text), public.pin_unlock(text), public.pin_lock()
  from public, anon;
grant execute on function public.job_propose(text,text,bigint), public.job_create_by_parent(uuid,text,text,bigint),
  public.job_negotiate(uuid,text,bigint), public.job_claim(uuid), public.job_confirm(uuid), public.job_return(uuid,text),
  public.ledger_add(uuid,text,bigint,text), public.bridge_add_game(uuid,integer), public.bridge_apply(uuid),
  public.job_close(uuid), public.family_init(text,text), public.family_erase(),
  public.pin_status(), public.pin_set(text,text), public.pin_unlock(text), public.pin_lock()
  to authenticated;

create or replace view public.child_real_balance with (security_invoker = true) as
  select child_id, sum(amount_agorot)::bigint as balance_agorot,
         sum(amount_agorot) filter (where amount_agorot > 0)::bigint as earned_agorot
  from public.ledger_entries group by child_id;
grant select on public.child_real_balance to authenticated;

-- ───────────── Аналитика (клиентам только track_events) ─────────────
create table public.events (
  id         bigint generated always as identity primary key,
  family_id  uuid not null references public.families(id) on delete cascade,
  child_id   uuid not null references public.child_profiles(child_id) on delete cascade,
  session_id text not null check (char_length(session_id) between 8 and 40 and session_id ~ '^[a-z0-9_.-]+$'),
  name       text not null,
  props      jsonb not null default '{}'::jsonb,
  ts         timestamptz not null default now(),
  client_ts  timestamptz
);
create index events_fam_ts on public.events (family_id, ts desc);
create index events_fam_name on public.events (family_id, name);
create index events_child_ts on public.events (child_id, ts);
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

create or replace view private.v_mission_funnel as
  select e.props->>'mission_id' as mission_id, e.props->>'scene_id' as scene_id, count(*)::int as reached
  from public.events e where e.name = 'scene_shown' group by 1, 2;
create or replace view private.v_mission_dropoff as
  select e.props->>'mission_id' as mission_id, e.props->>'last_scene_id' as last_scene_id, count(*)::int as abandoned
  from public.events e where e.name = 'mission_abandoned' group by 1, 2;
create or replace view private.v_scene_median as
  select e.props->>'mission_id' as mission_id, e.props->>'scene_id' as scene_id,
         percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric) as median_ms,
         (percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric) > 1800000) as over_30min
  from public.events e where e.name = 'scene_completed' and (e.props ? 'duration_ms') group by 1, 2;
create or replace view private.v_mission_median as
  select e.props->>'mission_id' as mission_id,
         percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric) as median_ms,
         (percentile_cont(0.5) within group (order by (e.props->>'duration_ms')::numeric) > 1800000) as over_30min
  from public.events e where e.name = 'mission_completed' and (e.props ? 'duration_ms') group by 1;
create or replace view private.v_calc_accuracy as
  select e.props->>'mission_id' as mission_id, e.props->>'scene_id' as scene_id, count(*)::int as answers,
         round(100.0 * avg(case when (e.props->>'correct') in ('true','t') then 1 else 0 end), 1) as pct_correct
  from public.events e where e.name = 'calculation_answered' group by 1, 2;
create or replace view private.v_choice_dist as
  select e.props->>'mission_id' as mission_id, e.props->>'scene_id' as scene_id, e.props->>'choice_id' as choice_id, count(*)::int as n
  from public.events e where e.name = 'choice_selected' group by 1, 2, 3;
create or replace view private.v_debrief_rate as
  select (select count(*) from public.events where name = 'mission_completed')::int as completed,
         (select count(*) from public.events where name = 'debrief_completed')::int as debriefed,
         case when (select count(*) from public.events where name = 'mission_completed') = 0 then null
              else round(100.0 * (select count(*) from public.events where name = 'debrief_completed')
                   / (select count(*) from public.events where name = 'mission_completed'), 1) end as pct_debrief;
create or replace view private.v_next_mission_rate as
  select (select count(*) from public.events where name = 'mission_completed')::int as completed,
         (select count(*) from public.events where name = 'next_mission_started')::int as next_started,
         case when (select count(*) from public.events where name = 'mission_completed') = 0 then null
              else round(100.0 * (select count(*) from public.events where name = 'next_mission_started')
                   / (select count(*) from public.events where name = 'mission_completed'), 1) end as pct_next;
create or replace view private.v_mission_rating as
  select e.props->>'mission_id' as mission_id, count(*)::int as n, round(avg((e.props->>'rating')::numeric), 2) as avg_rating
  from public.events e where e.name = 'mission_rating' and (e.props ? 'rating') group by 1;
create or replace view private.v_returns as
  with days as (
    select e.child_id, (e.ts at time zone 'utc')::date as d from public.events e group by 1, 2
  ), firsts as (select child_id, min(d) as d0 from days group by 1)
  select count(*)::int as cohorts,
         count(*) filter (where exists (select 1 from days x where x.child_id = f.child_id and x.d = f.d0 + 1))::int as d1,
         count(*) filter (where exists (select 1 from days x where x.child_id = f.child_id and x.d = f.d0 + 3))::int as d3,
         count(*) filter (where exists (select 1 from days x where x.child_id = f.child_id and x.d = f.d0 + 7))::int as d7
  from firsts f;
create or replace view private.v_feature_usage as
  select count(*) filter (where name = 'blitz_started')::int as blitz,
         count(*) filter (where name = 'finny_chat_started')::int as chat,
         count(*) filter (where name = 'finny_voice_started')::int as voice,
         count(*) filter (where name = 'share_clicked')::int as share,
         count(*) filter (where name = 'limit_hit')::int as limit_hit,
         count(*) filter (where name = 'recharge_started')::int as recharge
  from public.events;
create or replace view private.v_by_age_lang as
  select e.props->>'age_group' as age_group, e.props->>'lang' as lang,
         count(*) filter (where e.name = 'mission_completed')::int as missions,
         count(*) filter (where e.name = 'blitz_started')::int as blitz,
         count(*) filter (where e.name = 'finny_chat_started')::int as chat,
         count(*) filter (where e.name = 'session_started')::int as sessions,
         round(avg(case when e.name = 'mission_rating' then (e.props->>'rating')::numeric end), 2) as avg_rating
  from public.events e group by 1, 2;
revoke all on private.v_mission_funnel, private.v_mission_dropoff, private.v_scene_median,
  private.v_mission_median, private.v_calc_accuracy, private.v_choice_dist, private.v_debrief_rate,
  private.v_next_mission_rate, private.v_mission_rating, private.v_returns, private.v_feature_usage,
  private.v_by_age_lang from public, anon, authenticated;

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
