-- ============================================================================
-- Финни: схема Supabase (Postgres 15+).  СТАТУС: ПОДГОТОВЛЕНА, НЕ ПРИМЕНЕНА.
-- Применять только осознанно: supabase db push / SQL editor, на пустом проекте.
-- Приложение сейчас хранит всё в localStorage и этой схемы не использует.
--
-- Принципы:
--  * Деньги — в агоротах (bigint). Журнал (ledger) только дописывается:
--    UPDATE/DELETE запрещены триггером, прямой INSERT запрещён всем (RLS),
--    записи создают только функции security definer, проверяющие роль.
--  * Родитель (role='parent') — полноправный участник семьи. Ребёнок
--    (role='child') — отдельная учётная запись в той же семье; видит своё,
--    предлагает заказы, торгуется и нажимает «Сделано», но не подтверждает выплаты
--    и не меняет настройки. Это закрывает слабое место localStorage
--    (ребёнок не может подправить журнал в консоли браузера).
--  * Платежей нет: журнал — учёт обещаний родителя.
--  * Личные данные ребёнка минимальны: имя/ник, язык, герой. Без фамилии,
--    телефона, адреса, даты рождения.
-- ============================================================================


-- ───────────── Семьи и участники ─────────────
create table public.families (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Семья' check (char_length(name) between 1 and 60),
  created_by  uuid not null references auth.users(id) on delete restrict,
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

-- Хелперы доступа (security definer, чтобы RLS не зацикливалась)
create or replace function public.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from family_members where family_id = fid and user_id = auth.uid());
$$;
create or replace function public.is_family_parent(fid uuid) returns boolean
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
  xp              integer not null default 0 check (xp >= 0),
  game_balance    integer not null default 0 check (game_balance >= 0),   -- игровые ₪ (виртуальные)
  badges          text[]  not null default '{}',
  streak          integer not null default 0 check (streak >= 0),
  last_day        date,
  missions_done   text[]  not null default '{}',
  active_run      jsonb,                                                   -- миссия в процессе
  idea_streak     integer not null default 0 check (idea_streak >= 0),
  idea_last_day   date,
  ideas_seen      text[]  not null default '{}',
  updated_at      timestamptz not null default now()
);

create table public.mission_completions (
  id            bigint generated always as identity primary key,
  child_id      uuid not null references public.child_profiles(child_id) on delete cascade,
  mission_id    text not null,
  xp_earned     integer not null check (xp_earned >= 0),
  game_gain     integer not null check (game_gain >= 0),
  completed_at  timestamptz not null default now(),
  run_log       jsonb                                                      -- решения для итогового разбора
);
create index on public.mission_completions (child_id, completed_at desc);

-- ───────────── Мечта ─────────────
create table public.dreams (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references public.child_profiles(child_id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 40),
  price_agorot  bigint not null check (price_agorot between 1000 and 10000000),
  game_saved    integer not null default 0 check (game_saved >= 0),        -- игровая копилка (виртуальная)
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  achieved_at   timestamptz
);
-- не более одной активной мечты на ребёнка
create unique index dreams_one_active on public.dreams (child_id) where active;

-- ───────────── Настройки родителей ─────────────
create table public.family_settings (
  family_id           uuid primary key references public.families(id) on delete cascade,
  -- мост «игровой ₪ → реальный»: ПО УМОЛЧАНИЮ ВЫКЛЮЧЕН
  bridge_rate_agorot  integer not null default 0 check (bridge_rate_agorot between 0 and 100),
  bridge_weekly_cap_agorot bigint not null default 0 check (bridge_weekly_cap_agorot between 0 and 10000000),
  match_pct           integer not null default 0 check (match_pct in (0,10,25,50,100)),
  share_enabled       boolean not null default true,
  share_name          boolean not null default false,
  voice_input         boolean not null default false,
  arena_rounds_per_day integer not null default 4 check (arena_rounds_per_day between 0 and 20),
  missions_per_day    integer not null default 1 check (missions_per_day between 1 and 5),
  pin_hash            text,                                                -- PBKDF2/argon на клиенте; ПИН как барьер от ребёнка, не от атакующего
  pin_salt            text,
  updated_at          timestamptz not null default now()
);

-- ───────────── Заказы (дела дома) и торг ─────────────
create table public.jobs (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null references public.families(id) on delete cascade,
  child_id      uuid not null references public.child_profiles(child_id) on delete cascade,
  title         text not null check (char_length(title) between 3 and 60),
  done_when     text not null default '' check (char_length(done_when) <= 120),
  price_agorot  bigint not null check (price_agorot between 100 and 50000),   -- 1..500 ₪
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
  actor_id      uuid not null references auth.users(id),
  actor_role    text not null check (actor_role in ('parent','child')),
  kind          text not null check (kind in ('propose','counter','accept','claim','return','confirm','close')),
  price_agorot  bigint,
  note          text check (char_length(note) <= 200),
  created_at    timestamptz not null default now()
);
create index on public.job_events (job_id, id);

-- ───────────── Журнал реальных денег (append-only) ─────────────
create table public.ledger_entries (
  id            bigint generated always as identity primary key,
  family_id     uuid not null references public.families(id) on delete cascade,
  child_id      uuid not null references public.child_profiles(child_id) on delete cascade,
  kind          text not null check (kind in ('job','match','bridge','payout','adjust')),
  amount_agorot bigint not null check (amount_agorot <> 0),
  note          text not null default '' check (char_length(note) <= 80),
  job_id        uuid references public.jobs(id) on delete set null,
  created_by    uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  -- знак строго по типу записи
  constraint ledger_sign check (
    (kind in ('job','match','bridge') and amount_agorot > 0)
    or (kind = 'payout' and amount_agorot < 0)
    or (kind = 'adjust')
  ),
  -- за один заказ — не более одной записи 'job' и одной 'match'
  constraint ledger_job_ref check (kind not in ('job','match') or job_id is not null)
);
create unique index ledger_one_job_payment  on public.ledger_entries (job_id) where kind = 'job';
create unique index ledger_one_match        on public.ledger_entries (job_id) where kind = 'match';
create index on public.ledger_entries (child_id, created_at desc);

create or replace function public.ledger_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'ledger_entries is append-only';
end $$;
create trigger ledger_no_update before update or delete on public.ledger_entries
  for each row execute function public.ledger_immutable();
create trigger ledger_no_truncate before truncate on public.ledger_entries
  for each statement execute function public.ledger_immutable();

-- Недельный счётчик моста (сколько игровых ₪ заработано и сколько уже зачтено)
create table public.bridge_weeks (
  child_id        uuid not null references public.child_profiles(child_id) on delete cascade,
  week_start      date not null,                                           -- понедельник
  game_earned     integer not null default 0 check (game_earned >= 0),
  bridged_agorot  bigint  not null default 0 check (bridged_agorot >= 0),
  primary key (child_id, week_start)
);

-- ───────────── Использование (лимиты вместо in-memory) ─────────────
create table public.usage_daily (
  child_id  uuid not null references public.child_profiles(child_id) on delete cascade,
  day       date not null,
  kind      text not null check (kind in ('chat','arena','blitz','mission')),
  count     integer not null default 0 check (count >= 0),
  primary key (child_id, day, kind)
);

-- ───────────── Функции: каждое денежное действие — через них ─────────────
-- Ребёнок: предложить заказ
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

-- Родитель: предложить заказ самому (ход ребёнка)
create or replace function public.job_create_by_parent(p_child uuid, p_title text, p_done_when text, p_price_agorot bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare cp child_profiles; jid uuid;
begin
  select * into cp from child_profiles where child_id = p_child;
  if cp.child_id is null or not is_family_parent(cp.family_id) then raise exception 'forbidden'; end if;
  insert into jobs (family_id, child_id, title, done_when, price_agorot, turn)
    values (cp.family_id, cp.child_id, left(trim(p_title),60), left(coalesce(p_done_when,''),120), p_price_agorot, 'child')
    returning id into jid;
  insert into job_events (job_id, actor_id, actor_role, kind, price_agorot) values (jid, auth.uid(), 'parent', 'propose', p_price_agorot);
  return jid;
end $$;

-- Ход в торге: accept / counter / decline. Ходит тот, чья очередь.
create or replace function public.job_negotiate(p_job uuid, p_move text, p_price_agorot bigint default null)
returns void language plpgsql security definer set search_path = public as $$
declare j jobs; who text; counters int;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null then raise exception 'not found'; end if;
  who := case when is_family_parent(j.family_id) then 'parent' when j.child_id = auth.uid() then 'child' end;
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

-- Ребёнок: «Сделано!»
create or replace function public.job_claim(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null or j.child_id <> auth.uid() or j.status <> 'agreed' then raise exception 'forbidden'; end if;
  update jobs set status='claimed', updated_at=now() where id = j.id;
  insert into job_events (job_id, actor_id, actor_role, kind) values (j.id, auth.uid(), 'child', 'claim');
end $$;

-- Родитель: подтвердить — единственный путь, которым деньги попадают в журнал за дело
create or replace function public.job_confirm(p_job uuid) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs; pct int; bonus bigint;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null or not is_family_parent(j.family_id) or j.status <> 'claimed' then raise exception 'forbidden'; end if;
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

-- Родитель: вернуть на доработку
create or replace function public.job_return(p_job uuid, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare j jobs;
begin
  select * into j from jobs where id = p_job for update;
  if j.id is null or not is_family_parent(j.family_id) or j.status <> 'claimed' then raise exception 'forbidden'; end if;
  update jobs set status='agreed', updated_at=now() where id = j.id;
  insert into job_events (job_id, actor_id, actor_role, kind, note) values (j.id, auth.uid(), 'parent', 'return', left(p_note,200));
end $$;

-- Родитель: ручная запись (выплата со знаком минус, корректировка)
create or replace function public.ledger_add(p_child uuid, p_kind text, p_amount_agorot bigint, p_note text default '')
returns void language plpgsql security definer set search_path = public as $$
declare cp child_profiles;
begin
  select * into cp from child_profiles where child_id = p_child;
  if cp.child_id is null or not is_family_parent(cp.family_id) then raise exception 'forbidden'; end if;
  if p_kind not in ('payout','adjust') then raise exception 'bad kind'; end if;
  insert into ledger_entries (family_id, child_id, kind, amount_agorot, note, created_by)
    values (cp.family_id, cp.child_id, p_kind, case when p_kind='payout' then -abs(p_amount_agorot) else p_amount_agorot end, left(coalesce(p_note,''),80), auth.uid());
end $$;

-- Игровые ₪ за неделю учитывает сервер при завершении миссии
create or replace function public.bridge_add_game(p_child uuid, p_game integer) returns void
language plpgsql security definer set search_path = public as $$
declare ws date := date_trunc('week', now())::date;
begin
  if p_child <> auth.uid() and not exists (select 1 from child_profiles c where c.child_id = p_child and is_family_parent(c.family_id)) then raise exception 'forbidden'; end if;
  insert into bridge_weeks (child_id, week_start, game_earned) values (p_child, ws, greatest(p_game,0))
    on conflict (child_id, week_start) do update set game_earned = bridge_weeks.game_earned + greatest(p_game,0);
end $$;

-- Родитель: зачесть мост за текущую неделю. Нулевой курс или лимит = ничего не делает.
create or replace function public.bridge_apply(p_child uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare cp child_profiles; st family_settings; bw bridge_weeks; ws date := date_trunc('week', now())::date; amt bigint;
begin
  select * into cp from child_profiles where child_id = p_child;
  if cp.child_id is null or not is_family_parent(cp.family_id) then raise exception 'forbidden'; end if;
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

-- ───────────── Row Level Security ─────────────
alter table public.families            enable row level security;
alter table public.family_members      enable row level security;
alter table public.child_profiles      enable row level security;
alter table public.game_state          enable row level security;
alter table public.mission_completions enable row level security;
alter table public.dreams              enable row level security;
alter table public.family_settings     enable row level security;
alter table public.jobs                enable row level security;
alter table public.job_events          enable row level security;
alter table public.ledger_entries      enable row level security;
alter table public.bridge_weeks        enable row level security;
alter table public.usage_daily         enable row level security;

-- Семья и состав: видят участники; меняют родители
create policy fam_select  on public.families       for select using (is_family_member(id));
create policy fam_insert  on public.families       for insert with check (created_by = auth.uid());
create policy fam_update  on public.families       for update using (is_family_parent(id));
create policy mem_select  on public.family_members for select using (is_family_member(family_id));
create policy mem_parent  on public.family_members for all    using (is_family_parent(family_id)) with check (is_family_parent(family_id));

-- Профиль и состояние игры: ребёнок — своё, родитель — всей семьи
create policy cp_select on public.child_profiles for select using (child_id = auth.uid() or is_family_parent(family_id));
create policy cp_parent on public.child_profiles for all    using (is_family_parent(family_id)) with check (is_family_parent(family_id));
create policy gs_select on public.game_state for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = game_state.child_id and is_family_parent(c.family_id)));
create policy gs_child  on public.game_state for all    using (child_id = auth.uid()) with check (child_id = auth.uid());
create policy mc_select on public.mission_completions for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = mission_completions.child_id and is_family_parent(c.family_id)));
create policy mc_insert on public.mission_completions for insert with check (child_id = auth.uid());
create policy dr_select on public.dreams for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = dreams.child_id and is_family_parent(c.family_id)));
create policy dr_child  on public.dreams for all    using (child_id = auth.uid()) with check (child_id = auth.uid());

-- Настройки: читают родители; пишут родители (ребёнок настроек не видит, включая хэш PIN)
create policy fs_parent on public.family_settings for all using (is_family_parent(family_id)) with check (is_family_parent(family_id));

-- Заказы и события: только чтение; все изменения — функциями выше
create policy jobs_select on public.jobs       for select using (child_id = auth.uid() or is_family_parent(family_id));
create policy je_select   on public.job_events for select using (exists (select 1 from jobs j where j.id = job_events.job_id and (j.child_id = auth.uid() or is_family_parent(j.family_id))));

-- Журнал: только чтение. Записи создают функции security definer
create policy le_select on public.ledger_entries for select using (child_id = auth.uid() or is_family_parent(family_id));

create policy bw_select on public.bridge_weeks for select using (is_family_parent((select family_id from child_profiles c where c.child_id = bridge_weeks.child_id)));
create policy ud_select on public.usage_daily  for select using (child_id = auth.uid() or exists (select 1 from child_profiles c where c.child_id = usage_daily.child_id and is_family_parent(c.family_id)));

-- Прямой INSERT/UPDATE/DELETE в денежные таблицы закрыт для всех клиентских ролей
revoke insert, update, delete, truncate on public.jobs, public.job_events, public.ledger_entries, public.bridge_weeks from anon, authenticated;
revoke all on all tables in schema public from anon;
grant select on public.jobs, public.job_events, public.ledger_entries, public.bridge_weeks to authenticated;
-- Остальные таблицы: права на уровне таблиц, а строки ограничивает RLS
grant select, insert, update, delete on public.families, public.family_members, public.child_profiles, public.game_state,
  public.dreams, public.family_settings to authenticated;
grant select, insert on public.mission_completions to authenticated;
grant select on public.usage_daily to authenticated;
grant usage on all sequences in schema public to authenticated;

-- Функции доступны только вошедшим пользователям
revoke all on function public.job_propose(text,text,bigint), public.job_create_by_parent(uuid,text,text,bigint),
  public.job_negotiate(uuid,text,bigint), public.job_claim(uuid), public.job_confirm(uuid), public.job_return(uuid,text),
  public.ledger_add(uuid,text,bigint,text), public.bridge_add_game(uuid,integer), public.bridge_apply(uuid) from public, anon;
grant execute on function public.job_propose(text,text,bigint), public.job_create_by_parent(uuid,text,text,bigint),
  public.job_negotiate(uuid,text,bigint), public.job_claim(uuid), public.job_confirm(uuid), public.job_return(uuid,text),
  public.ledger_add(uuid,text,bigint,text), public.bridge_add_game(uuid,integer), public.bridge_apply(uuid) to authenticated;

-- Баланс копилки (по журналу) для удобства
create or replace view public.child_real_balance with (security_invoker = true) as
  select child_id, sum(amount_agorot)::bigint as balance_agorot,
         sum(amount_agorot) filter (where amount_agorot > 0)::bigint as earned_agorot
  from public.ledger_entries group by child_id;
grant select on public.child_real_balance to authenticated;
