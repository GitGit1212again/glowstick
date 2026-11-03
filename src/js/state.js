// Single in-memory state object, persisted to localStorage under one key.
// Everything the app knows lives here; views read it and call save() after edits.

import { validateBackup } from "./backup.js";
import { load, persist } from "./storage.js";
import { PERSONAL } from "../data/personal.js";

export const KEY = "glowstick.v1";

// "Tell someone" defaults. Neutral in every build; the personal build (src/data/personal.js) may preset a name
// and number. PERSONAL is null in the store build, so nothing personal is ever the default there.
export const DEFAULT_NOTIFY = Object.freeze({ name: "", phone: "", onEarn: true, onRedeem: true, auto: false, ...(PERSONAL?.notify || {}) });

export const DEFAULT_CATEGORIES = [
  { id: "groceries", name: "Groceries", color: "#c3ff3d" },
  { id: "eating", name: "Eating out", color: "#ff2fd2" },
  { id: "transport", name: "Fuel & transport", color: "#21f0ff" },
  { id: "housing", name: "Rent & housing", color: "#9b6bff" },
  { id: "utilities", name: "Utilities & phone", color: "#4a7bff" },
  { id: "subs", name: "Subscriptions", color: "#ff7ae0" },
  { id: "health", name: "Health", color: "#48d67a" },
  { id: "shopping", name: "Shopping", color: "#ffb52e" },
  { id: "gaming", name: "Gaming", color: "#ff4f6e" },
  { id: "fun", name: "Fun & going out", color: "#ff9ecf" },
  { id: "loans", name: "Loan payments", color: "#b78cff" },
  { id: "savings", name: "Savings transfer", color: "#6bffd6" },
  { id: "income", name: "Income", color: "#e8ff8a" },
  { id: "other", name: "Other", color: "#8f86b0" },
];

export function blank() {
  return {
    v: 1,
    settings: {
      currency: "$",
      haptics: true,      // vibration on XP gains and level-ups
      mascot: true,       // the character who peeks in on level-ups and badges
      income: 0,          // expected take-home per MONTH (derived; everything reads this)
      incomeFreq: "monthly", // how it was entered: "monthly" | "biweekly" | "weekly"
      incomeEntered: 0,   // the number as typed, in that frequency
      payday: 1,          // day of month
      sources: { manual: true, csv: true, notif: false },
      notifApps: [],      // package names to capture from; empty = anything that looks like money
      rewards: { mode: "both", rate: 0.05, cap: 50, list: [] },
      notify: { ...DEFAULT_NOTIFY },
      budgets: {},        // cat id -> monthly cap in dollars (overrides pct)
      pct: {},            // cat id -> percent of income (overrides DEFAULT_PCT in budget.js)
      impulse: { cats: ["eating", "gaming", "shopping"], weekly: {}, holdMinutes: 15, weekStart: 0 }, // weekStart: 0 = Sunday ... 6 = Saturday
    },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    tx: [],       // {id,date,desc,amount,cat,src,hash,fun?}
    rules: [],    // {match,cat}
    bills: [],    // {id,name,amount,day,cat,autopay,paid:{'YYYY-MM':txId}}
    goals: [],    // {id,name,target,saved,monthly,due,created,log:[{date,amt}],milestones:{25:true}}
    loans: [],    // {id,name,balance,apr,minPayment,extra,log:[{date,amt}]}
    pending: [],  // notification captures awaiting review
    urges: [],    // {id,desc,amount,cat,created,until,status:'holding'|'bought'|'skipped'}
    game: { xp: 0, streak: 0, lastActive: "", badges: {}, funMoney: 0, funLog: [], claimable: [], quests: {} },
  };
}

// `S` is never reassigned: every module (and the bundle, which cannot do live bindings) holds this one object.
export const S = load(KEY, blank, validateBackup);
migrate(S);

function migrate(s) {
  const b = blank();
  const hadEntered = s.settings && s.settings.incomeEntered != null; // before defaults fill it with 0
  s.settings = { ...b.settings, ...(s.settings || {}) };
  s.settings.sources = { ...b.settings.sources, ...(s.settings.sources || {}) };
  s.settings.rewards = { ...b.settings.rewards, ...(s.settings.rewards || {}) };
  s.settings.impulse = { ...b.settings.impulse, ...(s.settings.impulse || {}) };
  s.settings.notify = { ...b.settings.notify, ...(s.settings.notify || {}) };
  // income frequency (added later): older saves are monthly, entered = the monthly figure
  if (!["monthly", "biweekly", "weekly"].includes(s.settings.incomeFreq)) s.settings.incomeFreq = "monthly";
  if (!hadEntered) s.settings.incomeEntered = Number(s.settings.income) || 0;
  if (!s.categories?.some((c) => c.id === "gaming") && Array.isArray(s.categories)) s.categories.splice(s.categories.findIndex((c) => c.id === "fun"), 0, { id: "gaming", name: "Gaming", color: "#ff4f6e" });
  s.game = { ...b.game, ...(s.game || {}) };
  for (const k of ["tx", "rules", "bills", "goals", "loans", "pending", "urges", "categories"]) if (!Array.isArray(s[k])) s[k] = b[k];
  if (!s.categories.length) s.categories = b.categories;
}

export function save() { return persist(KEY, S); }

// Restore / erase: swap the CONTENTS of S in place so every importer (and window.GS.S) keeps seeing the live state.
export function replaceState(obj) {
  validateBackup(obj);
  const candidate = JSON.parse(JSON.stringify(obj));
  migrate(candidate);
  if (!persist(KEY, candidate, true)) return false;
  if (obj !== S) { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, candidate); }
  return true;
}

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

export function today() { return toISO(new Date()); }
export function toISO(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
export function monthKey(iso) { return iso.slice(0, 7); }
export function thisMonth() { return today().slice(0, 7); }
export function addMonths(monthKeyStr, n) {
  const [y, m] = monthKeyStr.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
export function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
export function monthLabel(mk, long) {
  const [y, m] = mk.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, long ? { month: "long", year: "numeric" } : { month: "short" });
}

export function cat(id) { return S.categories.find((c) => c.id === id) || S.categories[S.categories.length - 1]; }
export function catName(id) { return cat(id).name; }
export function catColor(id) { return cat(id).color; }
