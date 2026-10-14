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

const P = "11111111-1111-1111-1111-111111111111";
const C = "22222222-2222-2222-2222-222222222222";
const F = "33333333-3333-3333-3333-333333333333";
const X = "44444444-4444-4444-4444-444444444444";
const U = "55555555-5555-5555-5555-555555555555";
const F2 = "66666666-6666-6666-6666-666666666666";

await db.exec(`insert into auth.users values ('${P}'),('${C}'),('${X}'),('${U}');
 insert into families(id,created_by) values ('${F}','${P}'),('${F2}','${U}');
 insert into family_members values ('${F}','${P}','parent','Папа'),('${F}','${C}','child','Д'),('${F2}','${U}','parent','Один');
 insert into child_profiles(child_id,family_id) values ('${C}','${F}'),('${U}','${F2}');
 insert into game_state(child_id, game_balance) values ('${C}', 60),('${U}', 0);
 insert into family_settings(family_id, match_pct) values ('${F}', 10),('${F2}', 0);`);

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

await fails("ребёнок ставит PIN", C, "authenticated", "select pin_set('1234')");
await as(P, "authenticated", "select pin_set('1234')");
await fails("confirm без разблокировки", P, "authenticated", "select job_confirm('00000000-0000-0000-0000-000000000001')");
let st = await as(P, "authenticated", "select pin_status() s");
console.log("pin_status после set:", JSON.stringify(st.rows[0].s));
await as(P, "authenticated", "select pin_unlock('1234')");

let r = await as(C, "authenticated", "select job_propose('Помыть машину','блестит',4000) id");
const J = r.rows[0].id;
await fails("ребёнок подтверждает свой же заказ", C, "authenticated", `select job_confirm('${J}')`);
await fails(
  "ребёнок пишет в журнал напрямую",
  C,
  "authenticated",
  `insert into ledger_entries(family_id,child_id,kind,amount_agorot,created_by) values ('${F}','${C}','adjust',100000,'${C}')`
);
await fails("ребёнок пишет ledger_add", C, "authenticated", `select ledger_add('${C}','adjust',100000,'x')`);
await fails("ребёнок принимает свой ход (не его очередь)", C, "authenticated", `select job_negotiate('${J}','accept')`);
await as(P, "authenticated", `select job_negotiate('${J}','counter',2500)`);
await as(C, "authenticated", `select job_negotiate('${J}','counter',3000)`);
await as(P, "authenticated", `select job_negotiate('${J}','accept')`);
await fails("claim до договорённости чужим", X, "authenticated", `select job_claim('${J}')`);
await fails("confirm до claim", P, "authenticated", `select job_confirm('${J}')`);
await as(C, "authenticated", `select job_claim('${J}')`);
await as(P, "authenticated", `select job_confirm('${J}')`);
await fails("двойное confirm", P, "authenticated", `select job_confirm('${J}')`);
r = await as(P, "authenticated", "select kind, amount_agorot from ledger_entries order by id");
console.log(JSON.stringify(r.rows));
r = await as(C, "authenticated", "select balance_agorot from child_real_balance");
console.log("баланс ребёнка:", r.rows[0].balance_agorot);
r = await as(X, "authenticated", "select count(*) c from ledger_entries");
console.log("чужой видит записей:", r.rows[0].c);
r = await as(C, "authenticated", "select count(*) c from family_settings");
console.log("ребёнок видит настройки:", r.rows[0].c);
await fails("update журнала", P, "authenticated", "update ledger_entries set amount_agorot=1");
await as(P, "authenticated", `select ledger_add('${C}','payout',1000,'наличными')`);
r = await as(P, "authenticated", "select sum(amount_agorot) s from ledger_entries");
console.log("после выплаты:", r.rows[0].s);

await as(C, "authenticated", `select bridge_add_game('${C}',99999)`);
r = await as(P, "authenticated", `select game_earned from bridge_weeks where child_id='${C}'`);
console.log("мост game_earned (не 99999):", r.rows[0]?.game_earned);
r = await as(P, "authenticated", `select bridge_apply('${C}') a`);
console.log("мост по умолчанию:", r.rows[0].a);
await db.exec(`update family_settings set bridge_rate_agorot=10, bridge_weekly_cap_agorot=500 where family_id='${F}'`);
r = await as(P, "authenticated", `select bridge_apply('${C}') a`);
console.log("мост 10 агорот, лимит 5 ₪:", r.rows[0].a);
r = await as(P, "authenticated", `select bridge_apply('${C}') a`);
console.log("повторно:", r.rows[0].a);
await fails("ребёнок вызывает bridge_apply", C, "authenticated", `select bridge_apply('${C}')`);

await fails("клиентский INSERT families", C, "authenticated", `insert into families(name,created_by) values ('x','${C}')`);
await fails("клиентский INSERT members", P, "authenticated", `insert into family_members values ('${F}','${X}','child','X')`);

await fails("одно устройство: ход родителя без PIN", U, "authenticated", `select job_create_by_parent('${U}','Уборка','чисто',2000)`);
r = await as(U, "authenticated", "select job_propose('Сложить бельё','в шкафу',1500) id");
const J2 = r.rows[0].id;
await fails("одно устройство: parent-ход без unlock", U, "authenticated", `select job_negotiate('${J2}','accept')`);
await as(U, "authenticated", "select pin_set('9999')");
await as(U, "authenticated", "select pin_unlock('9999')");
await as(U, "authenticated", `select job_negotiate('${J2}','accept')`);
console.log("одно устройство: accept после unlock ок");
r = await as(U, "authenticated", `select job_create_by_parent('${U}','Посуда','вымыта',1800) id`);
const J3 = r.rows[0].id;
await as(U, "authenticated", "select pin_lock()");
await as(U, "authenticated", `select job_negotiate('${J3}','accept')`);
console.log("одно устройство: заказ родителя, ход ребёнка после lock ок");

await as(C, "authenticated", `insert into mission_completions(child_id,family_id,mission_id,xp_earned,game_gain) values ('${C}','${F2}','bracelets',99999,99999)`);
r = await as(C, "authenticated", "select family_id, xp_earned, game_gain from mission_completions where mission_id='bracelets'");
if (r.rows[0].family_id !== F || r.rows[0].xp_earned !== 30 || r.rows[0].game_gain !== 50) {
  console.log("НЕ УПАЛО (плохо): tenant/catalog mission_completions", JSON.stringify(r.rows[0]));
  process.exitCode = 1;
} else {
  console.log("ok tenant: mission_completions family_id свой, награда из каталога");
}
await as(C, "authenticated", `insert into dreams(child_id,family_id,title,price_agorot) values ('${C}','${F2}','x',2000)`);
r = await as(C, "authenticated", "select family_id from dreams where child_id='" + C + "'");
if (r.rows[0].family_id !== F) {
  console.log("НЕ УПАЛО (плохо): tenant dreams", JSON.stringify(r.rows[0]));
  process.exitCode = 1;
} else {
  console.log("ok tenant: dreams family_id свой");
}
await as(C, "authenticated", `update game_state set family_id='${F2}' where child_id='${C}'`);
r = await as(C, "authenticated", "select family_id from game_state where child_id='" + C + "'");
if (r.rows[0].family_id !== F) {
  console.log("НЕ УПАЛО (плохо): tenant game_state", JSON.stringify(r.rows[0]));
  process.exitCode = 1;
} else {
  console.log("ok tenant: game_state family_id свой");
}
await fails("чужой child_id в game_state", C, "authenticated", `insert into game_state(child_id,family_id,xp) values ('${U}','${F2}',999)`);

await as(U, "authenticated", "select pin_unlock('9999')");
await as(U, "authenticated", "select family_erase()");
r = await as(U, "authenticated", "select count(*) c from jobs");
console.log("после erase заказов у U:", r.rows[0].c);
r = await db.query(`select count(*) c from families where id='${F2}'`);
console.log("семья F2 после erase:", r.rows[0].c);

await fails("чужой PIN unlock", C, "authenticated", "select pin_unlock('1234')");
for (let i = 0; i < 5; i++) {
  r = await as(P, "authenticated", "select pin_unlock('0000') u");
  console.log("неверный PIN", i + 1, JSON.stringify(r.rows[0].u));
}
r = await as(P, "authenticated", "select pin_unlock('1234') u");
if (r.rows[0].u?.error !== "locked") {
  console.log("НЕ УПАЛО (плохо): PIN заблокирован после 5 ошибок", JSON.stringify(r.rows[0].u));
  process.exitCode = 1;
} else {
  console.log("ok PIN locked после 5 ошибок:", JSON.stringify(r.rows[0].u));
}
