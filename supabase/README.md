# Supabase для Финни

Проект `finni` (eu-west-1). `schema.sql` — полное состояние. Миграции в `migrations/`.

Модель «одно устройство»: `family_init` создаёт родителя и профиль ребёнка на одном `auth.uid()`.
Без входа сайт работает из localStorage.

PIN проверяет сервер (`family_pins`, `pin_unlock`). Хэш клиентам не отдаётся.
Родительские деньги и настройки требуют разблокировки на 10 минут.

Хелперы ролей (`is_family_member`, `is_family_parent`, `is_family_parent_unlocked`) живут в схеме `private` — не в Data API. Схему `private` в **Settings → API → Exposed schemas** не добавлять.

Проверка схемы: `cd supabase/tests && npm i @electric-sql/pglite && node schema.test.mjs`

## Auth (ручные шаги владельца)

Dashboard → **Authentication → Sign In / Providers**. Эти флаги в SQL не выставляются.

**Уже включено (скрин 2026-10-14):** Confirm email; Minimum password length = 10; anonymous sign-ins выключены.

1. **Email → Prevent use of leaked passwords** — включить (Have I Been Pwned). Нужен план **Pro**.
2. **Minimum password length** — **10** (уже стоит).
3. **Confirm email** — включено. Не выключать.
4. После создания аккаунтов родителей: **Allow new users to sign up** → выключить и Save. Пока тумблер зелёный, любой может зарегистрироваться и вызвать `family_init`.

Не добавлять схему `private` в Settings → API → Exposed schemas.

## Аналитика (миграция 006)

Таблица `public.events` + RPC `track_events`. Клиентам нет SELECT/INSERT.
Согласие и возрастная группа: `family_prefs_set` (без PIN). По умолчанию выкл.
Представления владельца (только SQL Editor): `private.v_mission_funnel`,
`v_mission_dropoff`, `v_scene_median`, `v_mission_median`, `v_calc_accuracy`,
`v_choice_dist`, `v_debrief_rate`, `v_next_mission_rate`, `v_mission_rating`,
`v_returns` (D1/D3/D7), `v_feature_usage`, `v_by_age_lang`.
`returned_next_day` — не событие, считается во `v_returns`.

Срок хранения **12 месяцев**. Раз в месяц в SQL Editor от владельца:

```sql
delete from public.events where ts < now() - interval '12 months';
```

Проверка: `cd supabase/tests && node schema.test.mjs && node analytics.test.mjs && npx tsx principles.test.mjs`
