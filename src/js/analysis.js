// Spending analysis: monthly totals, averages, recurring charges, patterns, suggestions.
// Pure functions over S.tx / S.bills / S.settings. Spending amounts are negative in S.tx; totals here are positive.
import { S, monthKey, thisMonth, addMonths, today, daysBetween, catName, toISO } from "./state.js";
import { merchantKey } from "./categorize.js";
import { fmt0, sum, avg, add, sub, toCents, fromCents } from "./money.js";
import { capFor } from "./budget.js";

const EXCLUDE = new Set(["savings", "income"]); // not "spending" for pattern purposes

export function spendTx(month) {
  return S.tx.filter((t) => t.amount < 0 && !EXCLUDE.has(t.cat) && (!month || monthKey(t.date) === month));
}
export function incomeTx(month) {
  return S.tx.filter((t) => t.amount > 0 && t.cat === "income" && (!month || monthKey(t.date) === month));
}

export function totalSpend(month) { return sum(spendTx(month), (t) => -t.amount); }
export function totalIncome(month) { return sum(incomeTx(month), (t) => t.amount); }

export function byCategory(month) {
  const m = {};
  for (const t of spendTx(month)) m[t.cat] = (m[t.cat] || 0) - toCents(t.amount);
  return Object.entries(m).map(([k, c]) => [k, fromCents(c)]).sort((a, b) => b[1] - a[1]);
}

export function months(n = 6) {
  const cur = thisMonth();
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(addMonths(cur, -i));
  return out;
}

// Full months with data, most recent first, excluding the current (partial) month.
export function fullMonthsWithData(max = 3) {
  const cur = thisMonth();
  const have = new Set(S.tx.map((t) => monthKey(t.date)));
  const out = [];
  for (let i = 1; i <= 24 && out.length < max; i++) { const mk = addMonths(cur, -i); if (have.has(mk)) out.push(mk); }
  return out;
}

export function avgMonthlySpend() {
  const ms = fullMonthsWithData(3);
  if (!ms.length) {
    // only the current month: scale it up by days elapsed
    const d = new Date(); const day = d.getDate(); const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const cur = totalSpend(thisMonth());
    return day >= 7 ? fromCents(Math.round(toCents(cur) * dim / day)) : cur;
  }
  return avg(ms, (m) => totalSpend(m));
}
export function avgCategory(cat) {
  const ms = fullMonthsWithData(3);
  if (!ms.length) return 0;
  return avg(ms, (m) => byCategory(m).find((x) => x[0] === cat)?.[1] || 0);
}
export function avgMonthlyIncome() {
  const ms = fullMonthsWithData(3);
  if (!ms.length) return S.settings.income || totalIncome(thisMonth());
  const v = avg(ms, (m) => totalIncome(m));
  return v || S.settings.income || 0;
}

// Income worked out from logged deposits (transactions filed as Income): the average of the last three full months
// that have any; until there is a full month, this month's deposits scaled by days elapsed. Returns {monthly, basis}.
export function depositIncome() {
  const withIncome = fullMonthsWithData(6).filter((m) => totalIncome(m) > 0).slice(0, 3);
  if (withIncome.length) return { monthly: avg(withIncome, (m) => totalIncome(m)), basis: `${withIncome.length} month${withIncome.length === 1 ? "" : "s"} of deposits`, months: withIncome.length };
  const cur = totalIncome(thisMonth());
  if (cur > 0) {
    const d = new Date(); const day = d.getDate(); const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const est = day >= 10 ? fromCents(Math.round(toCents(cur) * dim / day)) : cur;
    return { monthly: est, basis: "this month's deposits so far", months: 0 };
  }
  return { monthly: 0, basis: "no deposits logged yet", months: 0 };
}

// The income figure everything plans against.
//   manual   -> the typed figure, and nothing else. No figure means 0: logging a deposit must never quietly
//               become "expected income" and move free money.
//   deposits -> the expected figure if one was typed (deposits are then measured against it), otherwise the
//               average worked out from logged deposits.
export function currentIncome() {
  if (S.settings.incomeMode === "deposits") { if (S.settings.income > 0) return S.settings.income; return depositIncome().monthly || 0; }
  return S.settings.income || 0;
}

export function billsTotal() { return sum(S.bills, (b) => b.amount); }
export function loansTotal() { return sum(S.loans, (l) => l.minPayment); }

// Is this transaction a bill or loan payment that the Bills/Loans lists already account for?
function isFixedTx(t) {
  if (t.billId || t.loanId) return true;
  const d = t.desc.toLowerCase();
  if (S.bills.some((b) => { const k = (b.match || b.name).toLowerCase(); return k && d.includes(k); })) return true;
  if (S.loans.some((l) => { const k = l.name.toLowerCase(); return k && d.includes(k); })) return true;
  return false;
}

// Everyday ("habit") spending per month: transactions that are not bill/loan payments, averaged over full months,
// or the current month scaled up when that's all there is. Never less than what's already been spent this month.
export function habitSpend() {
  const habit = (m) => sum(spendTx(m).filter((t) => !isFixedTx(t)), (t) => -t.amount);
  const ms = fullMonthsWithData(3);
  const cur = habit(thisMonth());
  if (!ms.length) {
    const d = new Date(); const day = d.getDate(); const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return day >= 7 ? fromCents(Math.round(toCents(cur) * dim / day)) : cur;
  }
  return Math.max(cur, avg(ms, (m) => habit(m)));
}

// Money left each month = income − bills (from the Bills list) − loan minimums (from Loans) − everyday spending.
// Bills and loans always count, paid yet or not; that is the number the friend actually has to live on.
// Deposits above the planning figure are real money, so they count: income for the month is the planning figure
// or this month's deposits, whichever is higher. `extra` is the part above the figure (0 when no figure is set,
// so an unplanned app never shows income it was not told about).
export function freeCash() {
  const plan = currentIncome();
  const got = totalIncome(thisMonth());
  const extra = plan > 0 && got > plan ? sub(got, plan) : 0;
  const inc = add(plan, extra);
  const fixed = add(billsTotal(), loansTotal());
  const habits = habitSpend();
  const spend = add(fixed, habits);
  return { income: inc, plan, extra, spend, fixed, habits, free: sub(inc, spend) };
}

export function weekdayPattern(monthsBack = 3) {
  const out = [0, 0, 0, 0, 0, 0, 0];
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  const from = addMonths(thisMonth(), -monthsBack) + "-01";
  for (const t of spendTx()) if (t.date >= from) { const d = new Date(t.date + "T12:00").getDay(); out[d] -= toCents(t.amount); cnt[d]++; }
  return { totals: out.map(fromCents), counts: cnt };
}

export function topMerchants(month, n = 5) {
  const m = {};
  for (const t of spendTx(month)) { const k = merchantKey(t.desc) || t.desc.toLowerCase(); if (!m[k]) m[k] = { name: k, total: 0, count: 0, cat: t.cat }; m[k].total -= toCents(t.amount); m[k].count++; }
  return Object.values(m).map((x) => ({ ...x, total: fromCents(x.total) })).sort((a, b) => b.total - a.total).slice(0, n);
}

// Recurring charge detection: same merchant, similar amount, regular gap.
export function detectRecurring() {
  const groups = {};
  for (const t of S.tx) {
    if (t.amount >= 0) continue;
    const k = merchantKey(t.desc); if (!k) continue;
    (groups[k] = groups[k] || []).push(t);
  }
  const out = [];
  const billed = new Set(S.bills.map((b) => (b.match || b.name).toLowerCase()));
  for (const [k, list] of Object.entries(groups)) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.date.localeCompare(b.date));
    const amts = list.map((t) => -t.amount);
    const med = amts.slice().sort((a, b) => a - b)[Math.floor(amts.length / 2)];
    if (!(med > 0)) continue;
    const similar = list.filter((t) => Math.abs(-t.amount - med) / med < 0.15);
    if (similar.length < 2) continue;
    const gaps = [];
    for (let i = 1; i < similar.length; i++) gaps.push(daysBetween(similar[i - 1].date, similar[i].date));
    const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - avg) ** 2, 0) / gaps.length);
    if (sd > (avg < 20 ? 2 : 5)) continue; // irregular gaps: habit, not a bill
    if (["groceries", "eating", "transport"].includes(similar[similar.length - 1].cat) && similar.length < 6) continue;
    let period = null;
    if (avg >= 26 && avg <= 35) period = "monthly";
    else if (avg >= 12 && avg <= 16) period = "biweekly";
    else if (avg >= 6 && avg <= 8) period = "weekly";
    else if (avg >= 85 && avg <= 95) period = "quarterly";
    else if (avg >= 355 && avg <= 372) period = "yearly";
    if (!period) continue;
    if (period !== "monthly" && similar.length < 3) continue;
    const last = similar[similar.length - 1];
    const next = new Date(last.date + "T12:00"); next.setDate(next.getDate() + Math.round(avg));
    out.push({ key: k, name: titleCase(k), amount: med, period, count: similar.length, last: last.date, next: toISO(next), cat: last.cat, known: billed.has(k) || S.bills.some((b) => k.includes(b.name.toLowerCase()) || b.name.toLowerCase().includes(k)) });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

export function titleCase(s) { return String(s).replace(/\b\w/g, (c) => c.toUpperCase()); }

// Plain-language suggestions from what the data shows. Each: {ico, title, body, kind}
export function suggestions() {
  const out = [];
  const cur = thisMonth();
  const cats = byCategory(cur);
  const fullMonths = fullMonthsWithData(3);
  const dayOfMonth = new Date().getDate();
  const dim = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  if (fullMonths.length) {
    for (const [cat, amt] of cats) {
      const avg = avgCategory(cat);
      if (avg < 20) continue;
      // Monthly bill categories are scheduled costs, not a daily spending pace.
      const scheduled = S.bills.some((b) => b.cat === cat) || (cat === "loans" && S.loans.length > 0);
      const projected = !scheduled && dayOfMonth >= 5 ? amt * dim / dayOfMonth : amt;
      if (projected > avg * 1.3 && amt > 30) {
        out.push({ ico: "▲", kind: "over", title: `${catName(cat)} is running ${Math.round((projected / avg - 1) * 100)}% above your usual`, body: `${fmt0(amt)} so far vs a typical ${fmt0(avg)} a month. A rough daily-rate estimate is ${fmt0(projected)} if spending continues evenly.` });
      } else if (projected < avg * 0.7 && dayOfMonth > 20 && avg > 40) {
        out.push({ ico: "▼", kind: "under", title: `${catName(cat)} is down ${Math.round((1 - projected / avg) * 100)}% this month`, body: `${fmt0(amt)} vs your usual ${fmt0(avg)}. That gap is savings if it stays that way.` });
      }
    }
  }
  // budgets
  for (const c of S.categories) {
    const cat = c.id, cap = capFor(cat);
    if (!cap || cat === "income" || cat === "savings" || cat === "other") continue;
    const amt = cats.find((c) => c[0] === cat)?.[1] || 0;
    if (amt > cap) out.push({ ico: "!", kind: "budget", title: `${catName(cat)} is past its ${fmt0(cap)} cap`, body: `${fmt0(amt)} so far, ${fmt0(sub(amt, cap))} past it. Knowing is the useful part.` });
    else if (amt > cap * 0.8 && dayOfMonth < dim - 7) out.push({ ico: "◔", kind: "budget", title: `${catName(cat)} is at ${Math.round(amt / cap * 100)}% of its cap with ${dim - dayOfMonth} days left`, body: `${fmt0(sub(cap, amt))} of room left.` });
  }
  // small frequent purchases
  const small = {};
  for (const t of spendTx(cur)) if (-t.amount < 15) { small[t.cat] = small[t.cat] || { n: 0, sum: 0 }; small[t.cat].n++; small[t.cat].sum -= toCents(t.amount); }
  for (const v of Object.values(small)) v.sum = fromCents(v.sum);
  for (const [cat, v] of Object.entries(small)) if (v.n >= 8) out.push({ ico: "∙∙", kind: "small", title: `${v.n} small ${catName(cat).toLowerCase()} buys add up to ${fmt0(v.sum)}`, body: `Each looked under ${fmt0(15)}. Together they are ${Math.round(v.sum / Math.max(1, totalSpend(cur)) * 100)}% of this month's spending.` });
  // subscriptions not tracked as bills
  for (const r of detectRecurring().filter((x) => !x.known).slice(0, 3)) {
    out.push({ ico: "↻", kind: "recurring", title: `${r.name} looks like a ${r.period} charge (${fmt0(r.amount)})`, body: `Seen ${r.count} times, last ${r.last}. Add it as a bill so it is planned for, or cancel it if you don't use it.`, rec: r });
  }
  // weekend vs weekday
  const wk = weekdayPattern(3);
  const weekend = add(wk.totals[0], wk.totals[6]), weekday = sum(wk.totals.slice(1, 6));
  if (weekend + weekday > 200 && weekend / 2 > (weekday / 5) * 1.6) {
    out.push({ ico: "◐", kind: "pattern", title: `Weekend days cost about ${Math.round(((weekend / 2) / (weekday / 5) - 1) * 100)}% more than weekdays`, body: `A per-weekend plan (a set amount you can burn) tends to work better than trying to spend less on Tuesday.` });
  }
  // savings rate
  const fc = freeCash();
  if (fc.income > 0 && S.tx.length > 5) {
    const rate = fc.free / fc.income;
    if (rate < 0) out.push({ ico: "⚠", kind: "rate", title: `Spending is above income by ${fmt0(-fc.free)} a month`, body: `Average spend ${fmt0(fc.spend)} vs income ${fmt0(fc.income)}. Savings goals will not move until this flips; the category list above shows where it goes.` });
    else if (rate < 0.1) out.push({ ico: "≈", kind: "rate", title: `About ${fmt0(fc.free)} a month is free after typical spending`, body: `That is ${Math.round(rate * 100)}% of income. Goals here are set against that number, so the timeline is honest.` });
  }
  // top merchant
  const top = topMerchants(cur, 1)[0];
  if (top && top.count >= 3 && top.total > 60) out.push({ ico: "★", kind: "merchant", title: `${titleCase(top.name)} is your top spot this month`, body: `${top.count} visits, ${fmt0(top.total)} total.` });
  return out;
}
