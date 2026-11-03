// Savings goals: what is realistically available, and the give-and-take between amount per month and finish date.
import { S, thisMonth, addMonths, today } from "./state.js";
import { freeCash, avgCategory, byCategory, fullMonthsWithData } from "./analysis.js";
import { sum, sub, add, toCents, fromCents, round2 } from "./money.js";

// Cash not already promised to other goals or loan extras.
export function available(excludeGoalId) {
  const fc = freeCash();
  const goalsCommitted = sum(S.goals.filter((g) => g.id !== excludeGoalId && !isDone(g)), (g) => g.monthly);
  const loanExtras = sum(S.loans, (l) => l.extra);
  const committed = add(goalsCommitted, loanExtras);
  return { ...fc, committed, available: sub(fc.free, committed) };
}

export function remaining(g) { return Math.max(0, sub(g.target, g.saved)); }
export function isDone(g) { return remaining(g) <= 0; }
export function progress(g) { const t = toCents(g.target); return t > 0 ? Math.min(1, Math.max(0, toCents(g.saved) / t)) : 0; }

// Months to finish at `monthly` per month, in whole cents so 0.3 / 0.1 is 3, not 4.
export function monthsFor(g, monthly) { const r = toCents(remaining(g)); if (r <= 0) return 0; const m = toCents(monthly); if (m <= 0) return Infinity; return Math.ceil(r / m); }

// Add `amt` to a goal (and its log). Cents-safe; returns the amount actually added.
export function addToGoal(g, amt, note, date) {
  const a = round2(Math.abs(Number(amt) || 0));
  if (a <= 0) return 0;
  g.saved = add(g.saved, a);
  g.log = g.log || []; g.log.push({ date: date || today(), amt: a, ...(note ? { note } : {}) });
  return a;
}
export function dateAfterMonths(n) { if (!isFinite(n)) return null; return addMonths(thisMonth(), n); }
export function monthsUntil(dueMonth) {
  const [y, m] = dueMonth.split("-").map(Number);
  const [cy, cm] = thisMonth().split("-").map(Number);
  return Math.max(1, (y - cy) * 12 + (m - cm));
}

// Verdict for a proposed monthly amount against what's available.
export function verdict(monthly, avail) {
  if (avail <= 0) return { level: "no", text: "Nothing is free right now: typical spending already meets or beats income. Cuts first, then a goal." };
  const share = monthly / avail;
  if (share <= 0.6) return { level: "ok", text: `Uses ${Math.round(share * 100)}% of what's free each month. Comfortable.`, share };
  if (share <= 0.9) return { level: "tight", text: `Uses ${Math.round(share * 100)}% of what's free. Doable, but one bad month breaks it.`, share };
  if (share <= 1) return { level: "tight", text: `Uses ${Math.round(share * 100)}% of what's free. Every spare dollar, no slack.`, share };
  return { level: "no", text: `Needs ${Math.round(share * 100)}% of what's free: ${fmtGap(monthly - avail)} a month more than you have.`, share };
}
function fmtGap(n) { return (S.settings.currency || "$") + Math.round(n).toLocaleString(); }

// Three offers: comfortable / steady / all-in.
export function offers(g) {
  const a = available(g.id).available;
  const r = remaining(g);
  const mk = (label, share, note) => {
    const monthly = Math.max(0, Math.floor(a * share / 5) * 5);
    return { label, share, monthly, months: monthsFor(g, monthly), date: dateAfterMonths(monthsFor(g, monthly)), note };
  };
  return [mk("Easy", 0.5, "half of what's free"), mk("Steady", 0.7, "most of what's free"), mk("All in", 0.9, "nearly all of it")].map((o) => ({ ...o, feasible: o.monthly > 0 && r > 0 }));
}

// If the plan needs more than is available, where could it come from? Largest flexible categories first.
export function whereToCut(shortfall) {
  const flexible = ["eating", "fun", "shopping", "subs", "groceries", "transport", "other"];
  const out = [];
  if (!fullMonthsWithData(1).length) return out;
  for (const c of flexible) {
    const avg = avgCategory(c);
    if (avg < 25) continue;
    const cut = round2(Math.min(avg * 0.25, shortfall));
    out.push({ cat: c, avg, cut });
  }
  return out.sort((x, y) => y.cut - x.cut).slice(0, 4);
}

// Milestones hit but not yet rewarded. Rewards are on 25/50/75/100 percent.
export const MILESTONES = [25, 50, 75, 100];
export function newMilestones(g) {
  const p = progress(g) * 100;
  const hit = [];
  g.milestones = g.milestones || {};
  for (const m of MILESTONES) if (p >= m && !g.milestones[m]) hit.push(m);
  return hit;
}
