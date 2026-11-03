// Impulse tools: weekly allowances for the categories that get away from you, and the "hold" timer for a want.
// Weeks start on the day chosen in settings (Sunday by default). Allowances are per category per week, set in More → Impulse.
// A hold is not a test to pass. Waiting is the behaviour; buying afterwards is a fine, logged outcome.
import { S, save, uid, today, toISO, daysBetween, catName } from "./state.js";
import { addXP, XP, award, touch, checkQuests } from "./game.js";
import { trigger } from "./coupons.js";
import { txHash } from "./csv.js";
import { remaining, addToGoal } from "./goal.js";
import { weeklyFor, weekStart, weekEnd, weekSpend, daysLeftInWeek } from "./budget.js";
import { add, sub, round2, toCents, fromCents } from "./money.js";
export { weekStart, weekEnd, weekSpend, daysLeftInWeek };

export const HOLD_CHOICES = [10, 15, 30, 60]; // quick-pick minutes offered when starting a hold
export function defaultHoldMinutes() { return Math.max(1, Math.round(Number(S.settings.impulse?.holdMinutes) || 15)); }

// [{cat, cap, spent, left, frac}] for every impulse category with an allowance set
export function weekStatus() {
  const imp = S.settings.impulse || {};
  return (imp.cats || []).map((c) => { const cap = weeklyFor(c); const spent = weekSpend(c); return { cat: c, cap, spent, left: sub(cap, spent), frac: cap ? spent / cap : 0 }; });
}

// Did last week end inside every allowance? Award once per week.
export function checkWeekWin() {
  const lastWeek = new Date(weekStart() + "T12:00"); lastWeek.setDate(lastWeek.getDate() - 7);
  const lw = toISO(lastWeek);
  const key = "weekwin:" + lw;
  if (S.game[key] != null) return;
  const imp = S.settings.impulse;
  const withCaps = (imp.cats || []).filter((c) => weeklyFor(c) > 0);
  if (!withCaps.length) return;
  const hadData = S.tx.some((t) => t.date >= lw && t.date < weekStart());
  if (!hadData) return;
  const won = withCaps.every((c) => toCents(weekSpend(c, lw)) <= toCents(weeklyFor(c)));
  S.game[key] = won;
  save();
  if (won) { addXP(40, "a whole week inside the allowances — that is the goal money"); award("weekWin"); trigger("weekWin", "week of " + lw); }
}

// ---- Holds
// minutes: per-hold override of settings.impulse.holdMinutes.
export function startHold(desc, amount, cat, minutes) {
  const mins = Math.max(1, Math.round(Number(minutes) || defaultHoldMinutes()));
  const now = Date.now();
  const u = { id: uid(), desc: String(desc || "").trim(), amount: round2(Math.abs(Number(amount) || 0)), cat, minutes: mins, created: now, until: now + mins * 60000, status: "holding" };
  S.urges.unshift(u);
  save(); touch(); addXP(XP.urgeLogged, "paused before buying — the wait is where the choice happens");
  return u;
}
export function activeHolds() { return (S.urges || []).filter((u) => u.status === "holding"); }
export function holdReady(u) { return Date.now() >= u.until; }
export function holdLeftMs(u) { return Math.max(0, (u.until || 0) - Date.now()); }
// 0..1 of the wait that has passed
export function holdFrac(u) { const total = Math.max(1, (u.until || 0) - (u.created || 0)); return Math.min(1, Math.max(0, 1 - holdLeftMs(u) / total)); }
export function holdCountdown(u) { const left = holdLeftMs(u); const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000); return `${mm}:${String(ss).padStart(2, "0")}`; }

// bought=true: log the purchase, no penalty. bought=false: the amount goes to the not-spent pile.
// Returns a calm line for the UI to show.
export function resolveHold(u, bought) {
  if (u.status !== "holding") return "";
  u.status = bought ? "bought" : "skipped";
  u.resolved = Date.now();
  u.early = !holdReady(u);
  let line;
  if (bought) {
    const desc = u.desc || catName(u.cat);
    const amount = -round2(u.amount);
    S.tx.push({ id: uid(), date: today(), desc, amount, cat: u.cat, src: "manual", hash: txHash(today(), desc, amount), logged: today(), urgeId: u.id });
    touch();
    addXP(XP.log, "logged the buy — the record stays honest");
    line = "Logged. Deliberate is the point.";
  } else {
    S.game.notSpent = add(S.game.notSpent, u.amount);
    S.game.skips = (S.game.skips || 0) + 1;
    touch();
    addXP(XP.urgeSkip, "let a want pass — that money is still yours");
    award("holdout");
    if (S.game.skips >= 10) award("ironwill");
    if (S.game.skips % 5 === 0) trigger("hold5", S.game.skips + " skips");
    line = "Kept. It joins the not-spent pile.";
  }
  save(); checkQuests();
  return line;
}

// Change of mind before the timer ends: nothing logged, nothing counted, no comment.
export function dropHold(u) {
  if (u.status !== "holding") return;
  u.status = "dropped"; u.resolved = Date.now();
  save();
}

// Sweep the "not spent" pile into a goal
export function sweepNotSpent(goal) {
  const amt = fromCents(Math.max(0, toCents(S.game.notSpent)));
  if (amt <= 0) return 0;
  addToGoal(goal, amt, "skipped wants");
  S.game.notSpent = 0;
  save();
  award("swept");
  return amt;
}

// What that money means, in words the moment needs.
export function meaning(amount) {
  const out = [];
  amount = Number(amount) || 0;
  if (amount <= 0) return out;
  const g = S.goals.find((x) => remaining(x) > 0);
  if (g) {
    const pctOfRemaining = amount / remaining(g);
    if (g.monthly > 0) { const d = Math.round(amount / g.monthly * 30); out.push(`${d} day${d === 1 ? "" : "s"} of progress on ${g.name}`); }
    else out.push(`${Math.round(pctOfRemaining * 100)}% of what ${g.name} still needs`);
  }
  const l = S.loans.find((x) => Number(x.apr) > 0 && Number(x.balance) > 0);
  if (l) {
    const yrs = 3;
    out.push(`about ${S.settings.currency}${Math.round(amount * (1 + l.apr / 100 * yrs))} in interest terms if it sat on ${l.name} for ${yrs} years`);
  }
  const ws = weekStatus().find((w) => w.cap > 0);
  if (ws) out.push(`${Math.round(amount / ws.cap * 100)}% of this week's ${catName(ws.cat).toLowerCase()} allowance`);
  return out;
}

// Empty-state copy for the Home card when nothing is on hold: what / why / next.
export const HOLD_EMPTY = {
  what: "Nothing on hold.",
  why: "A hold is a timer between wanting something and buying it. Not a no — a pause.",
  next: "Next time something catches you, tap Want something? and let it sit.",
};
