// Pure-logic checks: money/cents, loan math, CSV parsing, bills, weeks, goals, quests, coupons, notification parsing.
// Run: node --test test/logic.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

globalThis.window = undefined;
// in-memory localStorage so save() is quiet
const mem = {};
globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
const { S, toISO, today } = await import("../src/js/state.js");
const { sum, add, sub, toCents, fromCents, round2, parseAmount, avg } = await import("../src/js/money.js");
const { schedule, compare, extraForMonths, paymentForTerm, applyPayment, monthInterest } = await import("../src/js/loan.js");
const { parseCSV, guessMapping, buildTransactions, parseDate, txHash } = await import("../src/js/csv.js");
const { parseNotification } = await import("../src/js/notif.js");
const { DEFAULT_PCT, weekStart, weekEnd, weekSpend, monthlyIncome, setIncomeEntered, capFor } = await import("../src/js/budget.js");
const { dueIn, nextDue, status, markPaid, unmarkPaid } = await import("../src/js/bills.js");
const { remaining, progress, monthsFor, addToGoal } = await import("../src/js/goal.js");
const { totalSpend, byCategory, freeCash, currentIncome } = await import("../src/js/analysis.js");
const game = await import("../src/js/game.js");
const C = await import("../src/js/coupons.js");
const { startHold, resolveHold, holdFrac, sweepNotSpent } = await import("../src/js/impulse.js");

const reset = () => { S.game.awarded = {}; S.tx = []; S.bills = []; S.goals = []; S.loans = []; S.urges = []; S.pending = []; S.rules = []; S.game.xp = 0; S.game.quests = {}; S.game.activeDays = {}; S.game.notSpent = 0; S.game.badges = {}; S.game.draws = undefined; S.settings.coupons2 = undefined; S.settings.income = 0; S.settings.impulse.weekStart = 0; };
const local = (daysAgo) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return toISO(d); };

// ---- money
test("cents sum: 0.1 + 0.2 style totals are exact", () => {
  assert.equal(sum([0.1, 0.2]), 0.3);
  assert.equal(sum([0.1, 0.2, 0.3, 0.4]), 1);
  assert.equal(add(19.99, 0.01), 20);
  assert.equal(sub(1.1, 1), 0.1);
  assert.equal(sum([{ a: 4.35 }, { a: 4.35 }, { a: 4.35 }], (x) => x.a), 13.05);
  assert.equal(sum(Array(100).fill(0.29)), 29);
  assert.equal(avg([1.005, 1.005]), 1.01);
  assert.equal(toCents(1.005), 101); // not 100.49999 truncated
  assert.equal(fromCents(101), 1.01);
  assert.equal(round2(2.675), 2.68);
  assert.equal(sum([NaN, undefined, "x", 1]), 1);
  assert.equal(toCents(-0.001), 0);
});

test("parseAmount: currency symbols, parentheses, thousands separators, signs, EU decimals", () => {
  assert.equal(parseAmount("$1,234.56"), 1234.56);
  assert.equal(parseAmount("(12.50)"), -12.5);
  assert.equal(parseAmount("-$12.50"), -12.5);
  assert.equal(parseAmount("$-12.50"), -12.5);
  assert.equal(parseAmount("12.50-"), -12.5);
  assert.equal(parseAmount("USD 45"), 45);
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1,234"), 1234);
  assert.equal(parseAmount("€ 7,5"), 7.5);
  assert.equal(parseAmount("+20.00"), 20);
  assert.ok(isNaN(parseAmount("")));
  assert.ok(isNaN(parseAmount("abc")));
  assert.ok(isNaN(parseAmount(null)));
  assert.ok(isNaN(parseAmount(Infinity)));
});

// ---- loans
test("amortization matches a standard 60-month car loan", () => {
  const pay = paymentForTerm(20000, 6, 60);
  assert.ok(Math.abs(pay - 386.66) < 0.01, "payment " + pay);
  const s = schedule(20000, 6, pay, 0);
  assert.equal(s.months, 60);
  assert.ok(Math.abs(s.totalInterest - 3199.36) < 1, "interest " + s.totalInterest);
  // every row is in whole cents and the balance never goes negative
  for (const r of s.schedule) { assert.equal(toCents(r.interest), Math.round(r.interest * 100)); assert.ok(r.balance >= 0); }
  assert.equal(s.schedule.at(-1).balance, 0);
});

test("extra payment shortens the loan and saves interest", () => {
  const l = { balance: 14200, apr: 9.4, minPayment: 335, extra: 150 };
  const c = compare(l);
  assert.ok(c.monthsSaved > 10);
  assert.ok(c.interestSaved > 800);
  const ex = extraForMonths(l, 24);
  const s = schedule(l.balance, l.apr, l.minPayment, ex);
  assert.ok(s.months <= 24 && s.months >= 23);
  assert.equal(extraForMonths(l, 200), 0);
});

test("payment below interest never pays off; zero balance is done", () => {
  assert.equal(schedule(10000, 24, 100, 0).neverPays, true);
  assert.equal(schedule(0, 24, 100, 0).months, 0);
});

test("log payment: interest to the cent, balance never negative, month-end dates clamp", () => {
  assert.equal(monthInterest(1000, 12), 10);
  assert.equal(monthInterest(1234.56, 9.4), 9.67);
  assert.deepEqual(applyPayment(1000, 12, 110), { balance: 900, interest: 10 });
  assert.equal(applyPayment(50, 12, 500).balance, 0);
  const s = schedule(300, 0, 100, 0, "2026-01-31");
  assert.deepEqual(s.schedule.map((r) => r.date), ["2026-02-28", "2026-03-31", "2026-04-30"]);
});

// ---- CSV
test("CSV: signed amount column", () => {
  reset();
  const rows = parseCSV('Date,Description,Amount\n09/17/2026,T-MOBILE,-70.00\n"09/15/2026","DOORDASH, INC","-14.50"\n09/15/2026,PAYROLL,1600\n');
  const m = guessMapping(rows);
  assert.deepEqual([m.date, m.desc, m.amount], [0, 1, 2]);
  const b = buildTransactions(rows, m);
  assert.equal(b.tx.length, 3);
  assert.equal(b.tx[1].desc, "DOORDASH, INC");
  assert.equal(b.tx[2].amount, 1600);
});

test("CSV: debit/credit columns and EU numbers", () => {
  reset();
  const rows = parseCSV("Posted Date;Payee;Debit;Credit\n2026-09-10;AMAZON;1.234,56;\n2026-09-11;ZELLE FROM MOM;;50,00\n");
  const m = guessMapping(rows);
  const b = buildTransactions(rows, m);
  assert.equal(b.tx[0].amount, -1234.56);
  assert.equal(b.tx[1].amount, 50);
});

test("CSV: all-positive card export gets flipped", () => {
  reset();
  const rows = parseCSV("Transaction Date,Description,Amount\n9/1/2026,STARBUCKS,5.25\n9/2/2026,WALMART,60.00\n");
  const m = guessMapping(rows);
  assert.equal(m.flip, true);
  assert.equal(buildTransactions(rows, m).tx[0].amount, -5.25);
});

test("CSV: bad rows come back with reasons, never as exceptions", () => {
  reset();
  S.tx = [{ hash: txHash("2026-09-01", "OLD ONE", -3), date: "2026-09-01", desc: "OLD ONE", amount: -3 }];
  const text = "﻿Date,Description,Amount\r\n" +
    "2026-09-01,OLD ONE,-3.00\r\n" +               // already in S.tx
    ",NO DATE,-5\r\n" +                             // no date
    "2026-09-02,BAD AMOUNT,abc\r\n" +               // bad amount
    "\r\n" +                                        // empty
    "   ,  ,\r\n" +                                 // empty (whitespace)
    "2026-09-03,\"$1,234.56\" spent,\"$1,234.56\"\r\n" +   // currency + thousands
    "2026-09-03,PAREN,(12.50)\r\n" +                // parentheses
    "2026-09-03,PAREN,(12.50)\r\n" +                // duplicate inside the file
    "2026-09-04,ZERO,0.00\r\n" +                    // zero: skipped, not an error
    "2026-09-04,HUGE,9999999999\r\n" +              // > 1e9
    "2026-09-05,RAGGED\r\n" +                       // short row: no amount
    "2026-09-06,\"UNBALANCED,-1.00\r\n";            // unterminated quote at EOF
  let r;
  assert.doesNotThrow(() => { const rows = parseCSV(text); r = buildTransactions(rows, guessMapping(rows)); });
  assert.equal(r.empty, 2);
  assert.equal(r.zero, 1);
  assert.equal(r.dupExisting, 1);
  assert.equal(r.dupInFile, 1);
  assert.equal(r.duplicates, 2);
  const reasons = Object.fromEntries(r.problems.map((p) => [p.row, p.reason]));
  assert.equal(reasons[3], "no date");
  assert.equal(reasons[4], "bad amount");
  assert.equal(reasons[11], "amount too large");
  assert.equal(reasons[12], "no amount");
  assert.deepEqual(r.skipped, r.problems.map((p) => p.row));
  assert.deepEqual(r.tx.map((t) => t.amount), [1234.56, -12.5]);
  assert.equal(r.tx[0].desc, "$1,234.56 spent");
  // rubbish input
  assert.doesNotThrow(() => buildTransactions(null, null));
  assert.doesNotThrow(() => buildTransactions(parseCSV(""), guessMapping([])));
  assert.equal(buildTransactions(parseCSV(null), guessMapping(parseCSV(null))).tx.length, 0);
  assert.doesNotThrow(() => guessMapping(parseCSV('"never closed')));
});

test("CSV: type column with dr/cr words, pipe delimiter", () => {
  reset();
  const rows = parseCSV("Date|Description|Amount|Type\n2026-09-01|COFFEE|4.50|DR\n2026-09-02|REFUND|4.50|CR\n");
  const m = guessMapping(rows);
  assert.equal(m.type, 3);
  const b = buildTransactions(rows, m);
  assert.deepEqual(b.tx.map((t) => t.amount), [-4.5, 4.5]);
});

test("dates in several shapes", () => {
  assert.equal(parseDate("2026-09-03"), "2026-09-03");
  assert.equal(parseDate("9/3/2026"), "2026-09-03");
  assert.equal(parseDate("03.09.2026"), "2026-09-03");
  assert.equal(parseDate("Sep 3, 2026"), "2026-09-03");
  assert.equal(parseDate("2026/09/03"), "2026-09-03");
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("nope"), null);
  assert.equal(parseDate("12345"), null);
});

// ---- bills
test("bill due day clamps: day 31 in a 30-day month, February, garbage", () => {
  assert.equal(dueIn("2026-04", 31), "2026-04-30");
  assert.equal(dueIn("2026-02", 31), "2026-02-28");
  assert.equal(dueIn("2028-02", 30), "2028-02-29");
  assert.equal(dueIn("2026-03", 31), "2026-03-31");
  assert.equal(dueIn("2026-05", 0), "2026-05-01");
  assert.equal(dueIn("2026-05", "x"), "2026-05-01");
  assert.equal(dueIn("2026-05", "15"), "2026-05-15");
});

test("bill next-due rolls to next month once paid, status labels", () => {
  reset();
  const mk = today().slice(0, 7);
  const b = { id: "b1", name: "Rent", amount: 900, day: 1, paid: {} };
  assert.equal(nextDue(b).month, mk);
  b.paid[mk] = "tx";
  const nd = nextDue(b);
  assert.notEqual(nd.month, mk);
  assert.equal(status(b).key, "paid");
});

// ---- weeks
test("week start crosses month and year boundaries and honours the chosen start day", () => {
  S.settings.impulse.weekStart = 0; // Sunday
  assert.equal(weekStart("2027-01-01"), "2026-12-27"); // Friday -> previous Sunday, previous year
  assert.equal(weekEnd("2027-01-01"), "2027-01-02");
  assert.equal(weekStart("2026-03-01"), "2026-03-01"); // a Sunday stays put
  assert.equal(weekStart("2026-03-10"), "2026-03-08"); // across a US DST switch (Mar 8 2026)
  assert.equal(weekStart("2026-11-03"), "2026-11-01"); // across fall-back (Nov 1 2026)
  S.settings.impulse.weekStart = 1; // Monday
  assert.equal(weekStart("2027-01-01"), "2026-12-28");
  assert.equal(weekStart("2026-09-14"), "2026-09-14");
  assert.equal(weekEnd("2026-09-14"), "2026-09-20");
  S.settings.impulse.weekStart = 0;
});

test("week spend sums in cents and ignores fun-money and credits", () => {
  reset();
  const d = today();
  S.tx = [{ date: d, cat: "eating", amount: -0.1 }, { date: d, cat: "eating", amount: -0.2 }, { date: d, cat: "eating", amount: -5, fun: true }, { date: d, cat: "eating", amount: 3 }];
  assert.equal(weekSpend("eating"), 0.3);
});

// ---- goals
test("goal months: whole-cent division, remaining and progress", () => {
  const g = { target: 0.3, saved: 0 };
  assert.equal(monthsFor(g, 0.1), 3); // 0.3/0.1 in floats is 3.0000000000000004 -> would ceil to 4
  assert.equal(monthsFor({ target: 1000, saved: 250 }, 250), 3);
  assert.equal(monthsFor({ target: 1000, saved: 250 }, 400), 2);
  assert.equal(monthsFor({ target: 100, saved: 100 }, 10), 0);
  assert.equal(monthsFor({ target: 100, saved: 0 }, 0), Infinity);
  assert.equal(remaining({ target: 10, saved: 9.9 }), 0.1);
  assert.equal(remaining({ target: 10, saved: 12 }), 0);
  assert.equal(progress({ target: 3, saved: 1 }), 1 / 3);
  assert.equal(progress({ target: 0, saved: 1 }), 0);
  const h = { target: 100, saved: 0.1 };
  assert.equal(addToGoal(h, 0.2), 0.2);
  assert.equal(h.saved, 0.3);
  assert.equal(h.log.length, 1);
});

// ---- analysis
test("planning figure: manual mode never infers income from deposits; deposits mode uses the expected figure when typed", () => {
  reset(); S.settings.incomeMode = "manual"; S.settings.income = 0;
  S.tx.push({ id: "d1", date: today(), amount: 1500, cat: "income", desc: "payroll" });
  assert.equal(currentIncome(), 0, "a logged deposit must not become expected income");
  assert.equal(freeCash().income, 0);
  S.settings.income = 2400;
  assert.equal(currentIncome(), 2400);
  S.settings.incomeMode = "deposits"; S.settings.income = 0;
  assert.ok(currentIncome() > 0, "deposits mode with no expected figure plans against deposits");
  S.settings.income = 3000;
  assert.equal(currentIncome(), 3000, "deposits mode with an expected figure plans against it");
  S.settings.incomeMode = "manual"; S.settings.income = 0;
});
test("free money: deposits above the expected figure are added; below it the figure holds; no figure means no income", () => {
  reset(); S.settings.incomeMode = "manual"; S.settings.income = 2000;
  S.tx.push({ id: "d1", date: today(), amount: 2600, cat: "income", desc: "payroll" });
  let fc = freeCash(); assert.equal(fc.income, 2600); assert.equal(fc.extra, 600); assert.equal(fc.plan, 2000);
  S.tx[0].amount = 1200; fc = freeCash(); assert.equal(fc.income, 2000); assert.equal(fc.extra, 0);
  S.settings.income = 0; fc = freeCash(); assert.equal(fc.income, 0); assert.equal(fc.extra, 0);
});
test("totals and free cash accumulate in cents", () => {
  reset();
  const mk = today().slice(0, 7);
  S.tx = [{ date: mk + "-01", cat: "eating", amount: -0.1, desc: "a" }, { date: mk + "-02", cat: "eating", amount: -0.2, desc: "b" }, { date: mk + "-03", cat: "groceries", amount: -1.1, desc: "c" }];
  assert.equal(totalSpend(mk), 1.4);
  assert.deepEqual(byCategory(mk), [["groceries", 1.1], ["eating", 0.3]]);
  S.settings.income = 100;
  S.bills = [{ name: "Rent", amount: 33.33 }, { name: "Phone", amount: 33.33 }];
  S.loans = [{ name: "Car", minPayment: 33.33 }];
  const fc = freeCash();
  assert.equal(fc.fixed, 99.99);
  assert.equal(fc.free, sub(100, add(99.99, fc.habits)));
  assert.equal(toCents(fc.free), Math.round(fc.free * 100));
});

// ---- game
test("streak: only real actions count, no XP for the check-in itself", () => {
  reset();
  S.game.streak = 0; S.game.lastActive = "";
  game.touch();
  assert.equal(S.game.streak, 1);
  assert.equal(S.game.xp, 0);
  S.game.lastActive = local(1); S.game.streak = 4;
  game.touch();
  assert.equal(S.game.streak, 5);
  S.game.lastActive = local(3); S.game.streak = 9;
  game.touch();
  assert.equal(S.game.streak, 1);
  assert.equal(S.game.xp, 0);
  assert.equal(game.XP.checkin, undefined);
});

test("XP: every reason names the behaviour; opening the app awards nothing", () => {
  reset();
  game.addXP(10, "logged");
  assert.equal(S.game.xp, 10);
  game.addXP(0, "nothing"); game.addXP(-5, "nothing");
  assert.equal(S.game.xp, 10);
  for (const v of Object.values(game.REASONS)) assert.ok(v.includes("—"), v);
  assert.equal(game.levelFor(0), 1);
  assert.equal(game.levelFor(game.needFor(2)), 2);
  assert.equal(game.levelFor(game.needFor(2) - 1), 1);
  const qs = game.todaysQuests();
  assert.equal(qs.length, 3);
  assert.ok(qs.every((q) => !q.done), "a fresh day has no quest done just from opening");
  game.checkQuests();
  assert.ok(game.todaysQuests().every((q) => !q.done), "checkQuests on open completes nothing");
});

test("restraint scoring uses local dates and only counts active days", () => {
  reset();
  const y = local(1);
  S.tx = [{ date: y, cat: "groceries", amount: -20, desc: "x" }];
  S.game.activeDays = { [y]: true };
  game.checkQuests();
  assert.equal(S.game.quests[y]?.scored, true, "yesterday (local) is scored");
  const utcY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(S.game.quests)) assert.match(k, /^\d{4}-\d{2}-\d{2}$/);
  if (utcY !== y) assert.equal(S.game.quests[utcY]?.scored, undefined, "no UTC-shifted day was scored");
  // an inactive day is marked scored but earns nothing
  reset();
  S.tx = [{ date: local(2), cat: "groceries", amount: -20, desc: "x" }];
  game.checkQuests();
  assert.equal(S.game.quests[local(2)].scored, true);
  assert.equal(S.game.xp, 0);
});

test("tier names: neutral defaults unless the personal build supplies its own", async () => {
  const { PERSONAL } = await import("../src/data/personal.js");
  const want = { 1: "Spark", 2: "Strobe", 3: "Supernova", ...(PERSONAL?.tiers || {}) };
  for (const t of [1, 2, 3]) assert.equal(game.TIERS[t].name, want[t]);
});

// ---- coupons
test("ramp: needed() progresses per earned draw and caps", () => {
  reset();
  const run = (ramp) => { C.setRamp(ramp); return [0, 1, 2, 3, 4, 9].map((e) => { S.game.draws.earned = e; return C.needed(); }); };
  C.giveDraw(0); // creates the counters
  assert.deepEqual(run("none"), [1, 1, 1, 1, 1, 1]);
  assert.deepEqual(run("gentle"), [1, 2, 3, 3, 3, 3]);
  assert.deepEqual(run("steady"), [1, 2, 3, 4, 5, 5]);
  assert.deepEqual(run("steep"), [1, 3, 5, 7, 8, 8]);
  // a trigger counts progress and grants when the ramp says so
  C.setRamp("gentle"); S.game.draws.earned = 0; S.game.draws.progress = 0; S.game.draws.available = 0;
  assert.equal(C.trigger("levelup"), true);
  assert.equal(C.trigger("levelup"), false);
  assert.equal(C.trigger("levelup"), true);
  assert.equal(S.game.draws.available, 2);
});

test("deal() rotates note lines and guards empty categories", () => {
  reset();
  C.giveDraw(4);
  for (const c of C.cards().slice()) C.removeCard(c.id);
  const k = C.cats()[0].id;
  assert.equal(C.deal(k), null, "no enabled cards: nothing dealt");
  assert.equal(S.game.draws.available, 4, "a failed deal spends nothing");
  C.addCard({ title: "Pick", note: "first line\nsecond line\n\nthird line", cat: k });
  const notes = [C.deal(k), C.deal(k), C.deal(k), C.deal(k)].map((e) => e.note);
  assert.deepEqual(notes, ["first line", "second line", "third line", "first line"]);
  assert.equal(C.deal(k), null, "no draws left");
  assert.equal(C.deal("nope"), null);
  assert.equal(C.dealableCats().length, 1);
  const w = C.wallet();
  assert.equal(w.length, 4);
  assert.equal(C.redeem(w[0]), true);
  assert.equal(C.redeem(w[0]), false);
});

// ---- holds
test("hold: per-hold minutes, skip feeds the not-spent pile in cents, buy logs without penalty", () => {
  reset();
  const u = startHold("pizza", 12.1, "eating", 30);
  assert.equal(u.minutes, 30);
  assert.ok(u.until - u.created === 30 * 60000);
  assert.ok(holdFrac(u) >= 0 && holdFrac(u) < 0.01);
  const u2 = startHold("skin", 0.2, "gaming");
  assert.equal(u2.minutes, 15);
  const xpBefore = S.game.xp;
  assert.equal(resolveHold(u, false), "Kept. It joins the not-spent pile.");
  assert.equal(resolveHold(u2, false), "Kept. It joins the not-spent pile.");
  assert.equal(S.game.notSpent, 12.3);
  assert.ok(S.game.xp > xpBefore);
  const u3 = startHold("dlc", 9.99, "gaming", 10);
  const n = S.tx.length;
  assert.equal(resolveHold(u3, true), "Logged. Deliberate is the point.");
  assert.equal(S.tx.length, n + 1);
  assert.equal(S.tx.at(-1).amount, -9.99);
  assert.equal(resolveHold(u3, true), "", "resolving twice does nothing");
  const g = { target: 100, saved: 0.1 };
  assert.equal(sweepNotSpent(g), 12.3);
  assert.equal(g.saved, 12.4);
  assert.equal(S.game.notSpent, 0);
});

// ---- notifications / budget defaults
test("notifications: purchases parse, codes and reminders are ignored", () => {
  const n = (title, text) => parseNotification({ id: "1", pkg: "p", app: title, title, text, time: Date.now() });
  assert.equal(n("$12.48 at Chipotle", "Paid with Visa").desc, "Chipotle");
  assert.equal(n("Chase", "You made a $45.00 transaction with STEAMGAMES.COM on Sep 19").amount, -45);
  assert.equal(n("Wells Fargo", "Deposit of $1,600.00 received from ACME PAYROLL").amount, 1600);
  assert.equal(n("Chase", "Your one-time code is 483920"), null);
  assert.equal(n("Chase", "Reminder: your payment of $335.00 is due Sep 25"), null);
});

test("default percentages add to 100", () => {
  assert.equal(Object.values(DEFAULT_PCT).reduce((a, b) => a + b, 0), 100);
});

test("income frequency: biweekly x26/12 and weekly x52/12 to the cent; settings.income stays monthly", () => {
  reset();
  assert.equal(monthlyIncome(1200, "biweekly"), 2600);
  assert.equal(monthlyIncome(600, "weekly"), 2600);
  assert.equal(monthlyIncome(3200, "monthly"), 3200);
  assert.equal(monthlyIncome(1234.56, "biweekly"), 2674.88);   // 123456 * 26 / 12 = 267488 cents
  assert.equal(monthlyIncome(0.01, "weekly"), 0.04);           // 1 * 52 / 12 = 4.33 -> 4 cents
  assert.equal(monthlyIncome("abc", "weekly"), 0);
  assert.equal(monthlyIncome(-5, "monthly"), 0);
  assert.equal(monthlyIncome(100, "nonsense"), 100);           // unknown frequency falls back to monthly
  setIncomeEntered(1200, "biweekly");
  assert.equal(S.settings.incomeEntered, 1200);
  assert.equal(S.settings.incomeFreq, "biweekly");
  assert.equal(S.settings.income, 2600);
  assert.equal(capFor("groceries"), 260);                      // 10% of the MONTHLY figure, so caps need no change
  setIncomeEntered(3200);                                      // no freq given -> monthly
  assert.equal(S.settings.income, 3200);
  assert.equal(S.settings.incomeFreq, "monthly");
});

test("bill XP is idempotent: pay -> unmark -> pay again grants once; a second month grants again", () => {
  reset();
  const m = today().slice(0, 7);
  const b = { id: "b1", name: "Phone", amount: 70, day: 28, cat: "utilities", paid: {} };
  S.bills = [b];
  markPaid(b);
  const once = S.game.xp;
  assert.ok(once > 0);
  assert.equal(S.tx.filter((t) => t.billId === "b1").length, 1);
  unmarkPaid(b, m);
  assert.equal(S.tx.filter((t) => t.billId === "b1").length, 0);
  assert.equal(S.game.xp, once, "undo does not refund");
  markPaid(b);
  assert.equal(S.game.xp, once, "paying the same month again is not paid twice");
  assert.equal(S.tx.filter((t) => t.billId === "b1").length, 1);
  assert.ok(S.game.awarded["bill:b1:" + m]);
  // next month is a new (bill, month) and earns again
  const quests = game.awardOnce("bill:b1:2099-01", 20, "bill paid");
  assert.equal(quests, true);
  assert.equal(game.awardOnce("bill:b1:2099-01", 20, "bill paid"), false);
});

// ---- mascot cosmetics
test("cosmetics: level, badge and tier unlocks; locked equip refused; defaults fall back", async () => {
  const cos = await import("../src/js/cosmetics.js");
  reset();
  S.settings.mascotStyle = {};
  const item = (kind, id) => cos.COSMETICS.find((c) => c.kind === kind && c.id === id);
  for (const k of cos.KINDS) assert.ok(cos.unlocked(item(k, cos.DEFAULTS[k])), k + " default is always unlocked");
  assert.deepEqual(cos.equipped(), { ...cos.DEFAULTS });
  // locked: level 1, no badges
  assert.equal(cos.unlocked(item("color", "cyan")), false);
  assert.equal(cos.equip("color", "cyan"), false, "locked equip refused");
  assert.equal(cos.equip("color", "nope"), false, "unknown item refused");
  assert.equal(cos.equipped().color, "violet");
  assert.equal(cos.unlockLabel(item("color", "pink")), "Level 4");
  assert.equal(cos.unlockLabel(item("face", "smug")), "Badge: Iron will");
  assert.equal(cos.unlockLabel(item("face", "sparkle")), game.TIERS[3].name + " badge");
  // level unlock
  S.game.xp = game.needFor(4);
  assert.equal(cos.unlocked(item("color", "pink")), true);
  assert.equal(cos.unlocked(item("accessory", "bow")), true);
  assert.equal(cos.unlocked(item("color", "amber")), false);
  assert.equal(cos.equip("accessory", "bow"), true);
  assert.equal(cos.equip("color", "pink"), true);
  assert.deepEqual(cos.equipped(), { ...cos.DEFAULTS, accessory: "bow", color: "pink" });
  assert.equal(S.settings.mascotStyle.color, "pink");
  // newly unlocked between two xp values: levels 2..4 crossed from 0
  const names = cos.newlyUnlocked(0, game.needFor(4)).map((c) => c.id);
  assert.ok(names.includes("cyan") && names.includes("lime") && names.includes("pink") && names.includes("bow") && names.includes("wink"));
  assert.ok(!names.includes("star") && !names.includes("gold"));
  assert.equal(cos.newlyUnlocked(game.needFor(4), game.needFor(4)).length, 0);
  // badge unlock
  assert.equal(cos.unlocked(item("face", "smug")), false);
  assert.equal(cos.equip("face", "smug"), false);
  S.game.badges.ironwill = "2026-09-19";
  assert.equal(cos.unlocked(item("face", "smug")), true);
  assert.equal(cos.equip("face", "smug"), true);
  assert.deepEqual(cos.newlyUnlocked(S.game.xp, S.game.xp, "ironwill").map((c) => c.id), ["smug"]);
  // tier unlock: ironwill is tier 2, sparkle needs tier 3
  assert.equal(cos.unlocked(item("face", "sparkle")), false);
  S.game.badges.goalDone = "2026-09-19"; // tier 3
  assert.equal(cos.unlocked(item("face", "sparkle")), true);
  const byGoal = cos.newlyUnlocked(S.game.xp, S.game.xp, "goalDone").map((c) => c.id).sort();
  assert.deepEqual(byGoal, ["halo", "sparkle"]);
  S.game.badges.streak30 = "2026-09-19"; // a second tier-3 badge unlocks nothing new by tier
  assert.deepEqual(cos.newlyUnlocked(S.game.xp, S.game.xp, "streak30"), []);
  // a saved choice that is no longer unlocked falls back to the default
  S.game.xp = 0;
  assert.equal(cos.equipped().color, "violet");
  assert.equal(cos.equipped().accessory, "none");
  assert.equal(cos.equipped().face, "smug", "badge unlocks do not depend on xp");
  S.settings.mascotStyle = {};
});

test("income migration: an older save with only settings.income gets monthly + incomeEntered = income", async () => {
  localStorage.setItem("glowstick.v1", JSON.stringify({ v: 1, settings: { income: 2750 }, tx: [], bills: [], goals: [], loans: [], game: {} }));
  const { replaceState } = await import("../src/js/state.js");
  replaceState(JSON.parse(localStorage.getItem("glowstick.v1"))); // swaps S's contents in place; S keeps its identity
  assert.equal(S.settings.incomeFreq, "monthly");
  assert.equal(S.settings.incomeEntered, 2750);
  assert.equal(S.settings.income, 2750);
  assert.equal(S.tx.length, 0);
});
