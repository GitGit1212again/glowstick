// Loan math: monthly amortization with an optional extra payment, and the interest you save by paying early.
// All balances run in integer cents; each month's interest is rounded to the cent the way a statement does it.

const toC = (n) => { const v = Number(n); return isFinite(v) ? Math.round(v * 100) : 0; };
const fromC = (c) => c / 100;

// Simulate paying `payment + extra` every month against `balance` at `apr` percent.
// Returns {months, totalInterest, totalPaid, schedule[], payoffDate, neverPays}
export function schedule(balance, apr, payment, extra = 0, startISO) {
  const r = (Number(apr) || 0) / 100 / 12;
  let bal = toC(balance);
  const pay = toC(payment) + toC(extra);
  const rows = [];
  let totalInterest = 0, totalPaid = 0, months = 0;
  const start = startISO ? new Date(startISO + "T12:00") : new Date();
  if (bal <= 0) return { months: 0, totalInterest: 0, totalPaid: 0, schedule: [], payoffDate: iso(start), neverPays: false };
  if (pay <= Math.round(bal * r)) return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, schedule: [], payoffDate: null, neverPays: true };
  while (bal > 0 && months < 1200) {
    const interest = Math.round(bal * r);
    let principal = pay - interest;
    if (principal > bal) principal = bal;
    bal -= principal;
    totalInterest += interest;
    totalPaid += principal + interest;
    months++;
    rows.push({ n: months, date: iso(addMonthsTo(start, months)), interest: fromC(interest), principal: fromC(principal), balance: fromC(Math.max(0, bal)) });
  }
  return { months, totalInterest: fromC(totalInterest), totalPaid: fromC(totalPaid), schedule: rows, payoffDate: iso(addMonthsTo(start, months)), neverPays: false };
}

export function compare(loan) {
  const base = schedule(loan.balance, loan.apr, loan.minPayment, 0);
  const withExtra = schedule(loan.balance, loan.apr, loan.minPayment, loan.extra || 0);
  return {
    base, withExtra,
    interestSaved: isFinite(base.totalInterest) && isFinite(withExtra.totalInterest) ? fromC(toC(base.totalInterest) - toC(withExtra.totalInterest)) : 0,
    monthsSaved: isFinite(base.months) && isFinite(withExtra.months) ? base.months - withExtra.months : 0,
  };
}

// Extra payment needed per month to be done within `targetMonths`. Bisection on the extra amount, in cents.
export function extraForMonths(loan, targetMonths) {
  if (targetMonths <= 0) return null;
  const base = schedule(loan.balance, loan.apr, loan.minPayment, 0);
  if (!base.neverPays && base.months <= targetMonths) return 0;
  let lo = 0, hi = Math.max(1, toC(loan.balance));
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    const s = schedule(loan.balance, loan.apr, loan.minPayment, fromC(mid));
    if (!s.neverPays && s.months <= targetMonths) hi = mid; else lo = mid;
  }
  return fromC(hi);
}

// Minimum payment for a standard fixed-term loan (if the user only knows term, not payment).
export function paymentForTerm(balance, apr, termMonths) {
  const r = (Number(apr) || 0) / 100 / 12;
  const n = Number(termMonths) || 0;
  const b = Number(balance) || 0;
  if (n <= 0) return 0;
  if (r === 0) return b / n;
  return b * r / (1 - Math.pow(1 + r, -n));
}

// One month's interest on a balance, to the cent (used when logging a payment).
export function monthInterest(balance, apr) { return fromC(Math.round(toC(balance) * ((Number(apr) || 0) / 100 / 12))); }
// Balance after a payment: interest for the month is taken first, the rest comes off principal. Never below 0.
export function applyPayment(balance, apr, amount) {
  const interest = toC(monthInterest(balance, apr));
  const bal = toC(balance) - (toC(amount) - interest);
  return { balance: fromC(Math.max(0, bal)), interest: fromC(interest) };
}

// Same calendar day n months on, clamped to the month's length (Jan 31 + 1 month = Feb 28/29, not Mar 3).
function addMonthsTo(d, n) {
  const y = d.getFullYear(), m = d.getMonth() + n, day = d.getDate();
  const dim = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(day, dim), 12);
}
function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
