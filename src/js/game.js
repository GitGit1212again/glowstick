// Gamification: XP and levels, daily streak, quests, badges, and goal rewards (capped fun money or a pick from your own list).
import { S, save, today, toISO, daysBetween, thisMonth, monthKey } from "./state.js";
import { newMilestones, MILESTONES } from "./goal.js";
import { weeklyFor, weekSpend } from "./budget.js";
import { PERSONAL } from "../data/personal.js";
import { sum, toCents } from "./money.js";

export const LEVELS = ["Spark", "Glowstick", "Strobe", "Laser", "Lightshow", "Headliner", "Main Stage", "Festival", "Supernova", "Legend"];
// XP only ever comes from a behaviour that helps: logging, paying, saving, pausing, sorting. Never from opening the app.
export const XP = { urgeSkip: 25, urgeLogged: 5, log: 10, categorize: 5, csvImport: 25, billOnTime: 20, billLate: 5, goalAdd: 15, goalPer10: 1, loanExtra: 20, quest: 15, review: 5 };
// Every reason names the behaviour and, briefly, why it helps. Callers may pass a short key from here or a full line.
export const REASONS = {
  "logged": "logged a transaction — the numbers stay true",
  "logged a transaction": "logged a transaction — the numbers stay true",
  "categorised": "sorted a transaction — patterns show up sooner",
  "imported": "imported a statement — weeks of spending in one go",
  "reviewed captures": "reviewed captured purchases — nothing slips through",
  "added to goal": "put money on a goal — closer to the thing you actually want",
  "loan payment": "paid on a loan — less interest from here on",
  "bill paid": "bill paid — one less thing hanging over you",
  "bill paid on time": "bill paid on time — no late fee",
  "skipped a want": "let a want pass — that money is still yours",
  "paused before buying": "paused before buying — the wait is where the choice happens",
};

import { onEvent, emit } from "./events.js";
import { trigger } from "./coupons.js";
export { onEvent };

// Level n needs 120 * n^1.5 xp total (level 2 at 340, level 5 at ~1340, level 10 at ~3800).
export function levelFor(xp) { let l = 1; while (l < LEVELS.length && xp >= needFor(l + 1)) l++; return l; }
export function needFor(level) { return level <= 1 ? 0 : Math.round(120 * Math.pow(level, 1.5)); }
export function levelInfo() {
  const xp = S.game.xp || 0, l = levelFor(xp);
  const lo = needFor(l), hi = l < LEVELS.length ? needFor(l + 1) : lo;
  return { level: l, name: LEVELS[l - 1], xp, into: xp - lo, span: Math.max(1, hi - lo), next: hi, frac: l < LEVELS.length ? (xp - lo) / (hi - lo) : 1 };
}

export function addXP(n, why) {
  n = Math.max(0, Math.round(Number(n) || 0));
  if (!n) return;
  why = REASONS[why] || why;
  const before = levelFor(S.game.xp);
  S.game.xp = (S.game.xp || 0) + n;
  const after = levelFor(S.game.xp);
  save();
  emit({ type: "xp", n, why });
  if (after > before) { emit({ type: "levelup", level: after, name: LEVELS[after - 1] }); trigger("levelup", "level " + after); }
}

// XP that must be earned at most once per thing: a bill paid for a given month, a transaction logged today.
// Undo does not refund XP, so re-doing the action must not pay again. `key` names the (action, subject, period).
export function awardOnce(key, n, why) {
  const a = (S.game.awarded = S.game.awarded || {});
  if (a[key]) return false;
  a[key] = today();
  save();
  addXP(n, why);
  return true;
}
export function alreadyAwarded(key) { return !!(S.game.awarded || {})[key]; }

// Called whenever the user DOES something (logs, pays, saves, pauses, sorts). Never on open. Keeps the streak
// honest: one real action per calendar day keeps it alive; opening the app alone does nothing.
export function touch() {
  const t = today();
  (S.game.activeDays = S.game.activeDays || {})[t] = true;
  for (const k of Object.keys(S.game.activeDays)) if (daysBetween(k, t) > 14) delete S.game.activeDays[k];
  const last = S.game.lastActive;
  if (last === t) { save(); return; }
  if (last && daysBetween(last, t) === 1) S.game.streak = (S.game.streak || 0) + 1;
  else S.game.streak = 1;
  S.game.lastActive = t;
  save();
  emit({ type: "streak", streak: S.game.streak });
  if (S.game.streak === 7) award("streak7");
  if (S.game.streak === 30) award("streak30");
  if (S.game.streak > 0 && S.game.streak % 7 === 0) trigger("streak7", S.game.streak + "-day streak");
  if (S.game.streak > 0 && S.game.streak % 30 === 0) trigger("streak30", S.game.streak + "-day streak");
  if (S.game.streak === 100) award("streak100");
}

export const BADGES = {
  first: { tier: 1, ico: "✦", name: "First entry", how: "Log your first transaction" },
  import: { tier: 1, ico: "⇪", name: "Importer", how: "Import a bank CSV" },
  streak7: { tier: 2, ico: "7", name: "One week", how: "7-day streak" },
  streak30: { tier: 3, ico: "30", name: "One month", how: "30-day streak" },
  streak100: { tier: 3, ico: "100", name: "Century", how: "100-day streak" },
  billOnTime: { tier: 1, ico: "✓", name: "On time", how: "Pay a bill on or before its due day" },
  billMonth: { tier: 2, ico: "◷", name: "Clean month", how: "Every bill paid on time in a month" },
  goalHalf: { tier: 2, ico: "◑", name: "Halfway", how: "Reach 50% of a goal" },
  goalDone: { tier: 3, ico: "◆", name: "Goal reached", how: "Finish a savings goal" },
  loanExtra: { tier: 2, ico: "↯", name: "Interest killer", how: "Put extra on a loan" },
  underBudget: { tier: 2, ico: "▼", name: "Under budget", how: "End a month under every category cap" },
  sorter: { tier: 2, ico: "▤", name: "Sorter", how: "Categorise 25 transactions" },
  noSpend: { tier: 1, ico: "∅", name: "No-spend day", how: "A logged day with zero spending" },
  holdout: { tier: 1, ico: "⏳", name: "Held out", how: "Skip something after a hold" },
  ironwill: { tier: 2, ico: "⛨", name: "Iron will", how: "Skip 10 holds" },
  weekWin: { tier: 2, ico: "◈", name: "Week won", how: "End a week inside every impulse allowance" },
  streak3: { tier: 1, ico: "3", name: "Warming up", how: "3-day streak" },
  log10: { tier: 1, ico: "10", name: "Ten in", how: "Log 10 transactions" },
  log100: { tier: 2, ico: "💯", name: "Bookkeeper", how: "Log 100 transactions" },
  grounded: { tier: 1, ico: "$", name: "Grounded", how: "Set your monthly income" },
  ruler: { tier: 1, ico: "≡", name: "Rule maker", how: "Make a filing rule" },
  captured: { tier: 1, ico: "◉", name: "Auto-pilot", how: "Confirm a captured notification" },
  goalMade: { tier: 1, ico: "◇", name: "Aiming", how: "Make a savings goal" },
  goalQuarter: { tier: 1, ico: "◔", name: "Quarter there", how: "Reach 25% of a goal" },
  saver500: { tier: 2, ico: "5", name: "Five hundred", how: "Put $500 into goals" },
  saver2k: { tier: 3, ico: "2k", name: "Two grand", how: "Put $2,000 into goals" },
  pauser: { tier: 1, ico: "⏸", name: "Pauser", how: "Use the hold button 10 times" },
  drySpell: { tier: 2, ico: "☀", name: "Dry spell", how: "3 no-spend days" },
  restraint10: { tier: 2, ico: "✋", name: "Self-control", how: "10 restraint quests done" },
  weekWin4: { tier: 3, ico: "◈◈", name: "Month of weeks", how: "4 weeks won" },
  drawn: { tier: 1, ico: "🎟", name: "Lucky", how: "Draw your first coupon" },
  redeemed5: { tier: 3, ico: "🎁", name: "Collector", how: "Redeem 5 coupons" },
  swept: { tier: 2, ico: "⇢", name: "Sweeper", how: "Sweep not-spent money into a goal" },
  loanMade: { tier: 1, ico: "↯", name: "Facing it", how: "Add a loan" },
  loanDone: { tier: 3, ico: "✂", name: "Debt free", how: "Bring a loan to zero" },
  level5: { tier: 2, ico: "★", name: "Lightshow", how: "Reach level 5" },
  level10: { tier: 3, ico: "★★", name: "Legend", how: "Reach level 10" },
  billsSet: { tier: 1, ico: "◷", name: "Bills lined up", how: "Add 3 bills" },
  wild1: { tier: 1, ico: "★", name: "Wildcard", how: "Draw a wildcard" },
  wild3: { tier: 2, ico: "★★★", name: "Wild collector", how: "Hold 3 wildcards at once" },
};
// Count-based badges: checked after any action (from checkQuests) and on open.
export function checkBadges() {
  const g = S.game;
  const logged = S.tx.filter((t) => t.src !== "bill").length;
  if (logged >= 10) award("log10");
  if (logged >= 100) award("log100");
  if (S.settings.income > 0) award("grounded");
  if (S.rules.length) award("ruler");
  if (S.tx.some((t) => t.src === "notif")) award("captured");
  if (S.goals.length) award("goalMade");
  if (S.goals.some((x) => x.target > 0 && (x.saved || 0) / x.target >= 0.25)) award("goalQuarter");
  const saved = sum(S.goals, (x) => sum(x.log || [], (l) => l.amt));
  if (saved >= 500) award("saver500");
  if (saved >= 2000) award("saver2k");
  if ((S.urges || []).length >= 10) award("pauser");
  if ((g.restraintTotal || 0) >= 10) award("restraint10");
  const noSpendDays = Object.values(g.quests || {}).filter((q) => q.noSpend === true).length;
  if (noSpendDays >= 3) award("drySpell");
  const weekWins = Object.keys(g).filter((k) => k.startsWith("weekwin:") && g[k] === true).length;
  if (weekWins >= 4) award("weekWin4");
  if ((g.draws?.earned || 0) >= 1) award("drawn");
  if ((g.draws?.wallet || []).filter((w) => w.redeemed).length >= 5) award("redeemed5");
  if (S.loans.length) award("loanMade");
  if (S.loans.some((l) => (l.log || []).length && Number(l.balance) === 0)) award("loanDone");
  const lv = levelFor(g.xp || 0);
  if (lv >= 5) award("level5");
  if (lv >= 10) award("level10");
  if (S.bills.length >= 3) award("billsSet");
  const wallet = g.draws?.wallet || [];
  if (wallet.some((w) => w.wild)) award("wild1");
  if (wallet.filter((w) => w.wild && !w.redeemed).length >= 3) award("wild3");
  if (g.streak >= 3) award("streak3");
}

// Progress toward a count-based badge, from the same state checkBadges() reads: { have, need } or null when the
// badge is a one-off event (first entry, importer, ...). Used by the badge sheet under More → Badges.
export function badgeProgress(id) {
  const g = S.game;
  const logged = () => S.tx.filter((t) => t.src !== "bill").length;
  const saved = () => sum(S.goals, (x) => sum(x.log || [], (l) => l.amt));
  const table = {
    streak3: () => [g.streak || 0, 3], streak7: () => [g.streak || 0, 7], streak30: () => [g.streak || 0, 30], streak100: () => [g.streak || 0, 100],
    log10: () => [logged(), 10], log100: () => [logged(), 100],
    saver500: () => [saved(), 500], saver2k: () => [saved(), 2000],
    pauser: () => [(S.urges || []).length, 10], ironwill: () => [g.skips || 0, 10],
    restraint10: () => [g.restraintTotal || 0, 10],
    drySpell: () => [Object.values(g.quests || {}).filter((q) => q.noSpend === true).length, 3],
    weekWin4: () => [Object.keys(g).filter((k) => k.startsWith("weekwin:") && g[k] === true).length, 4],
    redeemed5: () => [(g.draws?.wallet || []).filter((w) => w.redeemed).length, 5],
    level5: () => [levelFor(g.xp || 0), 5], level10: () => [levelFor(g.xp || 0), 10],
    billsSet: () => [S.bills.length, 3], sorter: () => [g.sorted || 0, 25],
  };
  const f = table[id];
  if (!f) return null;
  const [have, need] = f();
  return { have: Math.min(have, need), need, money: id === "saver500" || id === "saver2k" };
}

// Badge tier names: the personal build may carry its own (src/data/personal.js); otherwise neutral.
const TIER_NAMES = { 1: "Spark", 2: "Strobe", 3: "Supernova", ...(PERSONAL?.tiers || {}) };
export const TIERS = { 1: { name: TIER_NAMES[1], color: "#e0a060" }, 2: { name: TIER_NAMES[2], color: "#d8dcea" }, 3: { name: TIER_NAMES[3], color: "#ffd54a" } };
export function award(id) {
  if (S.game.badges[id]) return;
  S.game.badges[id] = today();
  save();
  emit({ type: "badge", id, ...BADGES[id] });
}

// ---- Quests: three per day, picked by date so they don't shuffle on reload.
// "Action" quests need something the user DID today (a log, a paid bill, money on a goal, a sort, a hold); none of
// them can be completed by merely opening the app. "Restraint" quests are about NOT spending, so they are scored
// once the day is over (next time the app opens), and only for days the app was actually used or notification
// capture was on — otherwise an unlogged day would count as a perfect one.
const spentOn = (date, cat) => sum(S.tx.filter((t) => t.date === date && t.amount < 0 && !t.fun && (!cat || t.cat === cat)), (t) => -t.amount);
const dailySlice = (cat) => weeklyFor(cat) / 7;
const loggedToday = (pred) => S.tx.some((t) => t.logged === today() && (!pred || pred(t)));
const QUESTS = [
  { id: "log", ico: "＋", title: "Log something", body: "Add at least one transaction today", check: () => loggedToday((t) => t.src !== "bill") },
  { id: "sort", ico: "▤", title: "Clear the pile", body: "Sort a transaction today and leave nothing this month as Other", avail: () => S.tx.some((t) => monthKey(t.date) === thisMonth()), check: () => S.game.sortedOn === today() && !S.tx.some((t) => monthKey(t.date) === thisMonth() && t.cat === "other") },
  { id: "goal", ico: "◆", title: "Feed a goal", body: "Add money to any savings goal today", avail: () => S.goals.length > 0, check: () => S.goals.some((g) => (g.log || []).some((l) => l.date === today())) },
  { id: "bills", ico: "◷", title: "Tick a bill", body: "Mark a bill paid today", avail: () => S.bills.length > 0, check: () => loggedToday((t) => t.src === "bill") },
  { id: "pending", ico: "◉", title: "Inbox zero", body: "Confirm or dismiss every captured notification", avail: () => !!S.settings.sources?.notif, check: () => S.pending.length === 0 && (S.game.reviewedOn === today() || loggedToday((t) => t.src === "notif")) },
  { id: "loan", ico: "↯", title: "Look at the interest", body: "Open a loan and check what extra would save", avail: () => S.loans.length > 0, check: () => S.game.quests[today()]?.viewedLoan },
  { id: "hold", ico: "⏳", title: "Let it sit", body: "Put a want on hold today, whichever way it ends", check: () => (S.urges || []).some((u) => u.created && toISO(new Date(u.created)) === today()) },
];
const RESTRAINT = [
  { id: "noTakeout", ico: "∅", title: "No takeout today", body: "Nothing filed under Eating out", eod: (d) => spentOn(d, "eating") === 0 },
  { id: "noGaming", ico: "∅", title: "No gaming spend today", body: "Nothing filed under Gaming", eod: (d) => spentOn(d, "gaming") === 0 },
  { id: "slice", ico: "◔", title: "Inside today's slice", body: "Impulse categories under 1/7 of their weekly allowance", eod: (d) => (S.settings.impulse.cats || []).every((c) => !weeklyFor(c) || toCents(spentOn(d, c)) <= toCents(dailySlice(c))) },
  { id: "noSpend", ico: "○", title: "No-spend day", body: "Nothing spent at all", eod: (d) => spentOn(d) === 0 && S.tx.some((t) => t.date <= d) },
  { id: "underWeek", ico: "◈", title: "Week still on track", body: "Every impulse category inside its weekly allowance so far", eod: (d) => (S.settings.impulse.cats || []).every((c) => !weeklyFor(c) || toCents(weekSpend(c, d)) <= toCents(weeklyFor(c))) },
  { id: "small", ico: "∙", title: "Small stuff", body: "Fewer than 3 purchases under $15 today", eod: (d) => S.tx.filter((t) => t.date === d && t.amount < 0 && -t.amount < 15).length < 3 },
];
function pickFor(dateStr) {
  const seed = Number(dateStr.replace(/-/g, "")) % 97;
  const rest = QUESTS.slice(1).filter((q) => { try { return !q.avail || q.avail(); } catch (e) { return false; } });
  const action = [QUESTS[0], rest.length ? rest[seed % rest.length] : QUESTS[QUESTS.length - 1]];
  const restraint = RESTRAINT[(seed * 5 + 1) % RESTRAINT.length];
  return { action: [...new Map(action.map((q) => [q.id, q])).values()], restraint };
}
// Record the sort/review actions the quests look for (called by screens that do them).
export function noteSorted() { S.game.sortedOn = today(); S.game.sorted = (S.game.sorted || 0) + 1; if (S.game.sorted >= 25) award("sorter"); save(); }
export function noteReviewed() { S.game.reviewedOn = today(); save(); }
export function todaysQuests() {
  const t = today();
  const { action, restraint } = pickFor(t);
  const done = (S.game.quests[t] = S.game.quests[t] || {});
  return [...action.map((q) => ({ ...q, done: !!done[q.id] })), { ...restraint, restraint: true, done: !!done[restraint.id] }];
}
function dayCounted(d) { return !!(S.game.activeDays || {})[d] || S.settings.sources.notif; }
export function checkQuests() {
  const t = today();
  const done = (S.game.quests[t] = S.game.quests[t] || {});
  for (const q of pickFor(t).action) {
    if (done[q.id]) continue;
    let ok = false;
    try { ok = q.check(); } catch (e) { ok = false; }
    if (ok) { done[q.id] = true; save(); addXP(XP.quest, "quest done: " + q.title.toLowerCase() + " — a habit, one day at a time"); }
  }
  // score restraint quests for the last 7 finished days, once each
  for (let i = 1; i <= 7; i++) {
    const d = new Date(t + "T12:00"); d.setDate(d.getDate() - i);
    const ds = toISO(d);
    const rec = (S.game.quests[ds] = S.game.quests[ds] || {});
    if (rec.scored) continue;
    rec.scored = true;
    const q = pickFor(ds).restraint;
    if (!dayCounted(ds)) continue;
    let ok = false;
    try { ok = q.eod(ds); } catch (e) { ok = false; }
    if (ok) { rec[q.id] = true; save(); addXP(XP.quest, (i === 1 ? "yesterday: " : ds + ": ") + q.title.toLowerCase() + " — restraint counts too"); if (q.id === "noSpend") award("noSpend"); }
    bumpRestraint(ok);
  }
  save();
  checkBadges();
  // trim old days, and the per-day award keys that go with them
  for (const k of Object.keys(S.game.quests)) if (daysBetween(k, t) > 14) delete S.game.quests[k];
  for (const [k, d] of Object.entries(S.game.awarded || {})) if ((k.startsWith("log:") || k.startsWith("sort:")) && d && daysBetween(d, t) > 14) delete S.game.awarded[k];
}
export function markQuest(flag) { const t = today(); (S.game.quests[t] = S.game.quests[t] || {})[flag] = true; save(); }

// ---- Rewards. A milestone on a goal unlocks a reward; rewards are small on purpose.
// Fun money = rate x the slice of the goal just completed, capped, and never more than 10% of the total goal.
export function rewardAmount(g, milestonePct) {
  const r = S.settings.rewards;
  const slice = (Number(g.target) || 0) * 0.25;
  const raw = slice * (Number(r.rate) || 0);
  return Math.max(0, Math.floor(Math.min(raw, Number(r.cap) || 0, (Number(g.target) || 0) * 0.1)));
}
export function checkGoalRewards(g) {
  const hits = newMilestones(g);
  for (const m of hits) {
    g.milestones[m] = today();
    const amt = rewardAmount(g, m);
    S.game.claimable.push({ id: g.id + ":" + m, goalId: g.id, goal: g.name, pct: m, amount: amt, date: today() });
    if (m === 50) { award("goalHalf"); trigger("milestone50", g.name); }
    if (m === 100) { award("goalDone"); trigger("milestone100", g.name); }
    emit({ type: "milestone", goal: g.name, pct: m, amount: amt });
  }
  if (hits.length) save();
}
export function claimMoney(c) {
  S.game.funMoney = sum([S.game.funMoney, c.amount]);
  S.game.funLog.push({ date: today(), amt: c.amount, note: `${c.goal} ${c.pct}%` });
  S.game.claimable = S.game.claimable.filter((x) => x.id !== c.id);
  save();
}
export function claimListItem(c, item) {
  S.game.funLog.push({ date: today(), amt: 0, note: `${c.goal} ${c.pct}%: ${item.name}` });
  S.game.claimable = S.game.claimable.filter((x) => x.id !== c.id);
  save();
}
export function spendFun(amount, note) {
  amount = Math.max(0, Number(amount) || 0);
  S.game.funMoney = Math.max(0, sum([S.game.funMoney, -amount]));
  S.game.funLog.push({ date: today(), amt: -amount, note });
  save();
}

// counters some draw triggers depend on
export function bumpRestraint(won) {
  S.game.restraintRun = won ? (S.game.restraintRun || 0) + 1 : 0;
  S.game.restraintTotal = (S.game.restraintTotal || 0) + (won ? 1 : 0);
  if (won && S.game.restraintRun % 3 === 0) trigger("restraint3");
  if (won && S.game.restraintTotal % 7 === 0) trigger("restraint7");
}
