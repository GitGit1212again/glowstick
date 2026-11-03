import { test } from "node:test";
import assert from "node:assert/strict";
const records = new Map(); let fail = false;
globalThis.localStorage = { getItem: (k) => records.get(k) ?? null, setItem: (k,v) => { if (fail) throw new Error("quota"); records.set(k,String(v)); } };
const { validateBackup } = await import("../src/js/backup.js");
const { load, persist, storageProblem } = await import("../src/js/storage.js");
const { blank, replaceState, S, KEY } = await import("../src/js/state.js");
const { demoState, canLoadDemo } = await import("../src/js/demo.js");
test("valid backup roundtrip and fictional goal are usable", () => {
  const demo = demoState(new Date(2026,9,6));
  assert.equal(validateBackup(JSON.parse(JSON.stringify(demo))).goals[0].saved,450);
  assert.equal(demo.settings.notify.phone, ""); assert.equal(demo.settings.sources.notif,false);
  assert.equal(demo.tx.length,40); assert.ok(canLoadDemo(blank())); assert.ok(!canLoadDemo(demo));
  const personal = blank(); personal.settings.income = 1; assert.ok(!canLoadDemo(personal));
});
test("malformed backups and prototype properties are rejected", () => {
  for (const bad of [{v:1}, {...blank(), tx:null}, {...blank(), tx:[{ id:"x",date:"bad",desc:"x",amount:3,cat:"other" }]}, {...blank(),settings:[]}, {...blank(), bills:[{id:"x",name:"bad",amount:1,day:0,paid:{}}]}]) assert.throws(() => validateBackup(bad));
  const bad = JSON.parse(JSON.stringify(blank())); bad.settings = JSON.parse('{"__proto__":{"polluted":true}}'); assert.throws(() => validateBackup(bad));
});
test("failed restore preserves current state and saved data", () => {
  assert.equal(replaceState(blank()),true); const original = JSON.stringify(S); const disk = records.get(KEY);
  fail = true; assert.equal(replaceState(demoState()),false); fail=false;
  assert.equal(JSON.stringify(S),original); assert.equal(records.get(KEY),disk); assert.match(storageProblem(KEY),/not saved/);
  assert.equal(replaceState(demoState()),true); assert.equal(storageProblem(KEY),"");
});
test("unreadable saved data cannot be overwritten by normal saves", () => {
  records.set("broken", "{unreadable"); assert.deepEqual(load("broken",()=>({blank:true})),{blank:true});
  assert.equal(persist("broken",{v:1}),false); assert.equal(records.get("broken"),"{unreadable");
  assert.match(storageProblem("broken"),/preserved/); assert.equal(persist("broken",{v:1},true),true);
});
test("invalid saved schema is preserved and storage failure can be retried", () => {
  records.set("invalid",'{"v":1}'); load("invalid",blank,validateBackup);
  assert.equal(persist("invalid",blank()),false); assert.equal(records.get("invalid"),'{"v":1}');
  fail=true; assert.equal(persist("retry",blank()),false); fail=false;
  assert.equal(persist("retry",blank()),true); assert.equal(storageProblem("retry"),"");
});

test("monthly rent does not become repeated daily-rate spending", async () => {
  const { suggestions } = await import("../src/js/analysis.js");
  assert.equal(replaceState(demoState()),true);
  assert.ok(!suggestions().some((x) => x.kind === "over" && x.title.startsWith("Rent & housing")));
});
