// Money formatting, lenient amount parsing, and integer-cents arithmetic.
// Every place that adds or subtracts money goes through sum()/add()/sub() so 0.1 + 0.2 never becomes 0.30000000000000004.
import { S } from "./state.js";

export function fmt(n, opts = {}) {
  const sym = S.settings.currency || "$";
  const v = Math.abs(Number(n) || 0);
  const s = v.toLocaleString(undefined, { minimumFractionDigits: opts.cents === false ? 0 : 2, maximumFractionDigits: opts.cents === false ? 0 : 2 });
  const sign = n < 0 && opts.sign !== false ? "-" : (opts.plus && n > 0 ? "+" : "");
  return sign + sym + s;
}

export function fmt0(n, opts = {}) { return fmt(Math.round(n), { ...opts, cents: false }); }

// ---- cents helpers
// Dollars -> integer cents. Non-numbers and NaN count as 0.
// The tiny epsilon keeps 1.005 (really 1.00499999…) rounding to 101 like a human would.
export function toCents(n) { const v = Number(n); return isFinite(v) ? (Math.sign(v) * Math.round(Math.abs(v) * 100 + 1e-6)) || 0 : 0; }
export function fromCents(c) { return (Number(c) || 0) / 100; }
export function round2(n) { return fromCents(toCents(n)); }
// Sum of a list, accumulated in integer cents. `pick` maps an item to a dollar amount (default: the item itself).
export function sum(list, pick) {
  let c = 0;
  for (const x of list || []) c += toCents(pick ? pick(x) : x);
  return fromCents(c);
}
export function add(...xs) { let c = 0; for (const x of xs) c += toCents(x); return fromCents(c); }
export function sub(a, b) { return fromCents(toCents(a) - toCents(b)); }
export function mul(a, k) { return fromCents(Math.round(toCents(a) * (Number(k) || 0))); }
export function div(a, k) { const d = Number(k); return d ? fromCents(Math.round(toCents(a) / d)) : 0; }
export function avg(list, pick) { const n = (list || []).length; return n ? div(sum(list, pick), n) : 0; }
export const eq = (a, b) => toCents(a) === toCents(b);

// Lenient parse: "$1,234.56", "(12.50)", "-12.50", "12.50-", "$-12.50", "1.234,56" (EU), "USD 45", "45 CR" -> number, else NaN.
export function parseAmount(s) {
  if (typeof s === "number") return isFinite(s) ? s : NaN;
  if (s == null) return NaN;
  let t = String(s).trim();
  if (!t) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1).trim(); }
  // sign may sit before or after a currency symbol / code, or trail the number
  if (/^[^\d]*[-−]/.test(t)) { neg = true; t = t.replace(/[-−]/, ""); }
  else if (/[-−][^\d]*$/.test(t)) { neg = true; t = t.replace(/[-−](?=[^\d]*$)/, ""); }
  else if (/^[^\d]*\+/.test(t)) t = t.replace("+", "");
  t = t.replace(/[^\d.,]/g, "");
  if (!t || !/\d/.test(t)) return NaN;
  // 1.234,56 (EU) vs 1,234.56 (US)
  if (/,\d{1,2}$/.test(t) && !/\.\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  if ((t.match(/\./g) || []).length > 1) t = t.replace(/\.(?=.*\.)/g, ""); // 1.234.567 -> 1234567
  const v = parseFloat(t);
  return isNaN(v) ? NaN : (neg ? -v : v);
}

export function pct(n) { return Math.round(n * 100) + "%"; }
