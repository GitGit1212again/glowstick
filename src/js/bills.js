// Bills: due dates, status, marking paid (which also logs a transaction).
import { S, save, uid, today, thisMonth, addMonths, daysBetween } from "./state.js";
import { txHash } from "./csv.js";
import { round2, toCents } from "./money.js";
import { XP, award, awardOnce, alreadyAwarded, touch, checkQuests } from "./game.js";
import { trigger } from "./coupons.js";

// Due date for a bill in month `mk` (YYYY-MM). Day 31 in a 30-day month and day 29-31 in February clamp to the
// month's last day; a missing/garbage day means the 1st.
export function dueIn(mk, day) {
  const [y, m] = mk.split("-").map(Number);
  const dim = new Date(y, m, 0).getDate();
  const d = Math.min(Math.max(1, Math.floor(Number(day)) || 1), dim);
  return mk + "-" + String(d).padStart(2, "0");
}

// The next unpaid due date for a bill: this month if not yet paid, otherwise next month.
export function nextDue(b) {
  const cur = thisMonth();
  const paid = b.paid || {};
  if (!paid[cur]) return { month: cur, date: dueIn(cur, b.day) };
  const nm = addMonths(cur, 1);
  return { month: nm, date: dueIn(nm, b.day) };
}

export function status(b) {
  const nd = nextDue(b);
  const d = daysBetween(today(), nd.date);
  if ((b.paid || {})[thisMonth()] && nd.month !== thisMonth()) return { key: "paid", label: "Paid this month", days: d, ...nd };
  if (d < 0) return { key: "overdue", label: `${-d} day${d === -1 ? "" : "s"} overdue`, days: d, ...nd };
  if (d === 0) return { key: "soon", label: "Due today", days: d, ...nd };
  if (d <= 7) return { key: "soon", label: `Due in ${d} day${d === 1 ? "" : "s"}`, days: d, ...nd };
  return { key: "later", label: `Due ${nd.date.slice(5).replace("-", "/")}`, days: d, ...nd };
}

export function overdueCount() { return S.bills.filter((b) => status(b).key === "overdue").length; }

export function upcoming(days = 7) {
  return S.bills.map((b) => ({ b, s: status(b) })).filter((x) => x.s.key !== "paid" && x.s.days <= days).sort((a, c) => a.s.days - c.s.days);
}

export function markPaid(b, opts = {}) {
  const st = status(b);
  const month = st.month;
  b.paid = b.paid || {};
  const date = opts.date || today();
  const amount = -Math.abs(round2(Number(opts.amount ?? b.amount) || 0));
  const desc = b.name;
  const rec = { id: uid(), date, desc, amount, cat: b.cat || "utilities", src: "bill", billId: b.id, hash: txHash(date, desc, amount), logged: today() };
  if (!S.tx.some((t) => t.billId === b.id && t.date.slice(0, 7) === month)) S.tx.push(rec);
  b.paid[month] = rec.id;
  save();
  touch();
  const onTime = st.days >= 0;
  // once per (bill, month): unmarking and marking again must not pay twice
  awardOnce("bill:" + b.id + ":" + month, onTime ? XP.billOnTime : XP.billLate, onTime ? "bill paid on time — no late fee" : "bill paid — one less thing hanging over you");
  if (onTime) award("billOnTime");
  if (S.bills.every((x) => (x.paid || {})[month]) && !alreadyAwarded("billMonth:" + month)) {
    const allOnTime = S.bills.every((x) => { const t = S.tx.find((y) => y.id === x.paid[month]); return t && t.date <= dueIn(month, x.day); });
    if (allOnTime) { (S.game.awarded = S.game.awarded || {})["billMonth:" + month] = today(); award("billMonth"); trigger("billMonth", month); }
  }
  checkQuests();
}

export function unmarkPaid(b, month) {
  const id = (b.paid || {})[month];
  if (!id) return;
  S.tx = S.tx.filter((t) => t.id !== id);
  delete b.paid[month];
  save();
}

// Match a bill against an imported transaction, so CSV imports mark bills paid automatically.
export function autoMatchBills(txs) {
  let n = 0;
  for (const b of S.bills) {
    const key = (b.match || b.name).toLowerCase();
    for (const t of txs) {
      if (t.amount >= 0 || !t.desc.toLowerCase().includes(key)) continue;
      const month = t.date.slice(0, 7);
      b.paid = b.paid || {};
      if (b.paid[month]) continue;
      const want = toCents(b.amount);
      if (Math.abs(-toCents(t.amount) - want) / Math.max(100, want) > 0.25) continue;
      b.paid[month] = t.id; t.billId = b.id; if (b.cat) t.cat = b.cat; n++;
    }
  }
  if (n) save();
  return n;
}
