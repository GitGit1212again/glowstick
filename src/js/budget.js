// Category budgets as a share of income. Defaults follow the usual budgeting guidance
// (needs ~50%, wants ~30%, savings ~20%) with the impulse-prone wants kept deliberately small.
// A dollar override in settings.budgets wins over the percentage; a weekly override wins over the derived weekly figure.
import { S, today, toISO, daysBetween } from "./state.js";
import { sum, toCents, fromCents, round2 } from "./money.js";

export const DEFAULT_PCT = {
  housing: 28, utilities: 7, groceries: 10, transport: 9, health: 5, loans: 7,   // needs: 66
  eating: 5, gaming: 3, fun: 4, shopping: 5, subs: 2,                            // wants: 19
  savings: 15,                                                                    // pay yourself: 15
};

export function pctFor(cat) {
  const p = S.settings.pct || {};
  return p[cat] != null ? Number(p[cat]) : (DEFAULT_PCT[cat] ?? 0);
}

export function income() { return Number(S.settings.income) || 0; }

// ---- Income frequency. Everything reads settings.income as a MONTHLY figure; the person may type it per
// month, every two weeks (26 a year) or per week (52 a year). Convert once, to the cent, when it is saved.
export const INCOME_FREQS = [
  { id: "monthly", label: "a month", perYear: 12 },
  { id: "biweekly", label: "every two weeks", perYear: 26 },
  { id: "weekly", label: "a week", perYear: 52 },
];
export function incomeFreq(id) { return INCOME_FREQS.find((f) => f.id === id) || INCOME_FREQS[0]; }
export function monthlyIncome(amount, freq) {
  const a = Number(amount);
  if (!isFinite(a) || a <= 0) return 0;
  const f = incomeFreq(freq);
  return fromCents(Math.round(toCents(a) * f.perYear / 12));
}
// Store what was typed and the monthly equivalent. Returns the monthly figure.
export function setIncomeEntered(amount, freq) {
  const f = incomeFreq(freq);
  const entered = round2(Math.max(0, Number(amount) || 0));
  S.settings.incomeFreq = f.id;
  S.settings.incomeEntered = entered;
  S.settings.income = monthlyIncome(entered, f.id);
  return S.settings.income;
}

// Monthly cap for a category: explicit dollars, else percentage of income (0 when there is no income set).
export function capFor(cat) {
  const b = S.settings.budgets || {};
  if (b[cat]) return Number(b[cat]) || 0;
  return Math.round(income() * pctFor(cat) / 100);
}
export function capSource(cat) { return (S.settings.budgets || {})[cat] ? "fixed" : "pct"; }

// Weekly allowance: explicit, else the monthly cap spread over 52 weeks.
export function weeklyFor(cat) {
  const w = S.settings.impulse?.weekly || {};
  if (w[cat]) return Number(w[cat]) || 0;
  return Math.round(capFor(cat) * 12 / 52);
}
export function weeklySource(cat) { return (S.settings.impulse?.weekly || {})[cat] ? "fixed" : "pct"; }

export function allCaps() {
  return S.categories.filter((c) => c.id !== "income" && c.id !== "other").map((c) => ({ cat: c.id, pct: pctFor(c.id), cap: capFor(c.id), source: capSource(c.id) }));
}
export function totalPct() { return S.categories.filter((c) => c.id !== "income" && c.id !== "other").reduce((a, c) => a + pctFor(c.id), 0); }

// ---- Week maths (weeks start on settings.impulse.weekStart, Sunday by default)
// Local-noon arithmetic so DST switches and month/year boundaries cannot shift the day.
export function weekStart(iso = today()) {
  const d = new Date(iso + "T12:00");
  const start = ((Number(S.settings.impulse?.weekStart) || 0) % 7 + 7) % 7;
  const dow = (d.getDay() - start + 7) % 7; // days since the week began
  d.setDate(d.getDate() - dow);
  return toISO(d);
}
export function weekEnd(iso = today()) { const d = new Date(weekStart(iso) + "T12:00"); d.setDate(d.getDate() + 6); return toISO(d); }
export function daysLeftInWeek() { return Math.max(1, Math.min(7, daysBetween(today(), weekEnd()) + 1)); }

export function weekSpend(cat, iso = today()) {
  const a = weekStart(iso), b = weekEnd(iso);
  return sum(S.tx.filter((t) => t.cat === cat && t.amount < 0 && !t.fun && t.date >= a && t.date <= b), (t) => -t.amount);
}

