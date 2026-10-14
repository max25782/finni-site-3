import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const db = new PGlite();
await db.exec(`
 create schema auth;
 create table auth.users (id uuid primary key);
 create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true),'')::uuid $$;
 create role anon; create role authenticated;
 grant usage on schema public to anon, authenticated; grant usage on schema auth to anon, authenticated;
`);
try {
  await db.exec("create extension if not exists pgcrypto");
} catch {
  await db.exec(`
    create or replace function sha256(src bytea) returns bytea language sql immutable as $$
      select decode(md5(encode(src,'escape')), 'hex') || decode(md5(encode(src,'hex')), 'hex');
    $$;
  `);
}
const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "schema.sql");
await db.exec(fs.readFileSync(schemaPath, "utf8"));
console.log("schema applied");

const C = "22222222-2222-2222-2222-222222222222";
const F = "33333333-3333-3333-3333-333333333333";
const X = "44444444-4444-4444-4444-444444444444";
const U = "55555555-5555-5555-5555-555555555555";
const F2 = "66666666-6666-6666-6666-666666666666";
const P = "11111111-1111-1111-1111-111111111111";

await db.exec(`insert into auth.users values ('${P}'),('${C}'),('${X}'),('${U}');
 insert into families(id,created_by) values ('${F}','${P}'),('${F2}','${U}');
 insert into family_members values ('${F}','${P}','parent','Папа'),('${F}','${C}','child','Д'),('${F2}','${U}','parent','Один');
 insert into child_profiles(child_id,family_id) values ('${C}','${F}'),('${U}','${F2}');
 insert into game_state(child_id) values ('${C}'),('${U}');
 insert into family_settings(family_id) values ('${F}'),('${F2}');`);

const as = async (uid, role, q, params = []) => {
  await db.exec(`select set_config('request.jwt.sub','${uid}',false); set role ${role};`);
  try {
    return await db.query(q, params);
  } finally {
    await db.exec("reset role;");
  }
};
const fails = async (name, uid, role, q) => {
  try {
    await as(uid, role, q);
    console.log("НЕ УПАЛО (плохо):", name);
    process.exitCode = 1;
  } catch (e) {
    console.log("ok запрещено:", name, "→", String(e.message).slice(0, 80));
  }
};

const ev = (name, props = {}, sid = "sessabcd12") =>
  JSON.stringify([{ name, props, session_id: sid, client_ts: new Date().toISOString() }]);

const track = async (uid, payload) => {
  const r = await as(uid, "authenticated", `select track_events('${payload.replace(/'/g, "''")}'::jsonb) r`);
  return r.rows[0].r;
};

await fails("клиентский INSERT events", C, "authenticated", `insert into events(family_id,child_id,session_id,name) values ('${F}','${C}','sessabcd12','session_started')`);
await fails("клиентский SELECT events", C, "authenticated", "select * from events");

let r = await track(C, ev("session_started", { lang: "he", age_group: "10-11", device_class: "mobile", app_version: "0.1.0" }));
if (r.accepted !== 1) {
  console.log("НЕ УПАЛО (плохо): валидное событие", r);
  process.exitCode = 1;
} else console.log("ok принято:", r);

r = await track(C, ev("not_a_real_event", { lang: "he" }));
if (r.accepted !== 0 || r.dropped !== 1) {
  console.log("НЕ УПАЛО (плохо): неизвестное имя", r);
  process.exitCode = 1;
} else console.log("ok отвергнуто неизвестное имя");

r = await track(C, ev("finny_chat_started", { message: "hello" }));
if (r.accepted !== 0) {
  console.log("НЕ УПАЛО (плохо): неизвестный ключ", r);
  process.exitCode = 1;
} else console.log("ok отвергнут неизвестный ключ (текст чата)");

r = await track(C, ev("finny_chat_started", { lang: "это кириллица" }));
if (r.accepted !== 0) {
  console.log("НЕ УПАЛО (плохо): кириллица", r);
  process.exitCode = 1;
} else console.log("ok отвергнута кириллица");

r = await track(C, ev("share_clicked", { kind: "whats app" }));
if (r.accepted !== 0) {
  console.log("НЕ УПАЛО (плохо): пробелы в строке", r);
  process.exitCode = 1;
} else console.log("ok отвергнуты пробелы");

r = await track(C, ev("share_clicked", { kind: "x".repeat(41) }));
if (r.accepted !== 0) {
  console.log("НЕ УПАЛО (плохо): длинная строка", r);
  process.exitCode = 1;
} else console.log("ok отвергнута длинная строка");

r = await track(C, ev("finny_chat_started", { lang: "he" }));
if (r.accepted !== 1) {
  console.log("НЕ УПАЛО (плохо): чат без текста должен пройти", r);
  process.exitCode = 1;
} else console.log("ok finny_chat_started без текста");

const before = (await db.query(`select count(*)::int c from events where family_id='${F2}'`)).rows[0].c;
await track(C, ev("blitz_started", { lang: "ru" }));
const after = (await db.query(`select count(*)::int c from events where family_id='${F2}'`)).rows[0].c;
if (after !== before) {
  console.log("НЕ УПАЛО (плохо): запись в чужую семью");
  process.exitCode = 1;
} else console.log("ok не пишет за чужую семью");

const batch = [];
for (let i = 0; i < 101; i++) batch.push({ name: "limit_hit", props: { lang: "he" }, session_id: "sessabcd12" });
r = await track(C, JSON.stringify(batch));
if (r.accepted !== 100 || r.dropped < 1) {
  console.log("НЕ УПАЛО (плохо): лимит 100 за вызов", r);
  process.exitCode = 1;
} else console.log("ok лимит 100 за вызов:", r);

const todayBefore = (await db.query(`select count(*)::int c from events where family_id='${F}' and ts >= date_trunc('day', now())`)).rows[0].c;
const need = Math.max(0, 1000 - todayBefore);
if (need) {
  await db.exec(`insert into events(family_id,child_id,session_id,name)
    select '${F}','${C}','sessabcd12','session_started' from generate_series(1, ${need})`);
}
r = await track(C, ev("limit_hit", { lang: "he" }));
if (r.accepted !== 0) {
  console.log("НЕ УПАЛО (плохо): суточный лимит", r);
  process.exitCode = 1;
} else console.log("ok суточный лимит 1000, лишнее отброшено");

r = await as(X, "authenticated", `select track_events('${ev("session_started")}'::jsonb) r`);
if (r.rows[0].r.accepted !== 0) {
  console.log("НЕ УПАЛО (плохо): чужой uid пишет", r.rows[0].r);
  process.exitCode = 1;
} else console.log("ok без семьи не пишет");

await as(U, "authenticated", "select pin_set('9999')");
await as(U, "authenticated", "select pin_unlock('9999')");
r = await as(U, "authenticated", "select family_prefs_set(true,'7-9') r");
if (r.rows[0].r?.ok !== true) {
  console.log("НЕ УПАЛО (плохо): family_prefs_set", r.rows[0].r);
  process.exitCode = 1;
} else console.log("ok family_prefs_set");

r = await track(U, ev("session_started", { lang: "he" }));
const evU = (await db.query(`select count(*)::int c from events where family_id='${F2}'`)).rows[0].c;
if (r.accepted !== 1 || evU < 1) {
  console.log("НЕ УПАЛО (плохо): U не записал событие", r, evU);
  process.exitCode = 1;
}
await as(U, "authenticated", "select family_erase()");
const evU2 = (await db.query(`select count(*)::int c from events where family_id='${F2}'`)).rows[0].c;
if (evU2 !== 0) {
  console.log("НЕ УПАЛО (плохо): events после family_erase", evU2);
  process.exitCode = 1;
} else console.log("ok events удалены при family_erase");

const views = [
  "v_mission_funnel",
  "v_mission_dropoff",
  "v_scene_median",
  "v_mission_median",
  "v_calc_accuracy",
  "v_choice_dist",
  "v_debrief_rate",
  "v_next_mission_rate",
  "v_mission_rating",
  "v_returns",
  "v_feature_usage",
  "v_by_age_lang",
];
for (const v of views) {
  await db.query(`select * from private.${v}`);
}
console.log("ok представления владельца");

await fails("клиент читает v_feature_usage", C, "authenticated", "select * from private.v_feature_usage");

const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "lib", "analytics.ts"), "utf8");
if (/chat.?text|message|content|user_agent|ip_address|birth/.test(src.split("PROP_KEYS")[1].split("]")[0])) {
  console.log("НЕ УПАЛО (плохо): запрещённые ключи в PROP_KEYS");
  process.exitCode = 1;
} else console.log("ok PROP_KEYS без текста чата / имён / IP / UA");

console.log(process.exitCode ? "FAIL" : "analytics tests ok");
