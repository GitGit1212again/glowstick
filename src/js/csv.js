// Bank CSV import: parse, guess which columns are date/description/amount, build transactions, dedupe.
// Nothing here throws on bad input: unbalanced quotes, ragged rows, a BOM, CRLF, blank lines and junk amounts all
// come back as counts and per-row problems for the mapping screen (ui/more.js) to show.
import { parseAmount, toCents } from "./money.js";
import { guessCategory } from "./categorize.js";
import { S, uid } from "./state.js";

export const MAX_AMOUNT = 1e9; // anything above this is a parse error, not a transaction

// Rows as arrays of strings. Blank lines are dropped but counted (`rows.emptyLines`); every row carries its
// 1-based source line in `row.line` so problems can point at the file.
export function parseCSV(text) {
  const rows = [];
  rows.emptyLines = 0;
  if (text == null) return rows;
  text = String(text).replace(/^﻿/, "");
  if (!text.trim()) return rows;
  const delim = sniffDelimiter(text);
  let row = [], field = "", q = false, line = 1, rowLine = 1;
  const endRow = () => {
    row.push(field); field = "";
    if (row.some((x) => x.trim() !== "")) { row.line = rowLine; rows.push(row); } else rows.emptyLines++;
    row = []; rowLine = line;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else { if (c === "\n") line++; field += c; }
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line++;
      endRow();
    } else field += c;
  }
  // an unterminated quote just ends at EOF; a trailing newline is not a blank row
  if (row.length || field !== "") endRow();
  return rows;
}

// The delimiter is whichever of , ; tab | appears most on the first non-empty line (outside quotes).
function sniffDelimiter(text) {
  const line = text.split(/\r?\n|\r/).find((l) => l.trim()) || "";
  const counts = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  let q = false;
  for (const c of line) { if (c === '"') q = !q; else if (!q && c in counts) counts[c]++; }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

const DATE_H = /^(date|posted|post date|posting date|transaction date|trans date|txn date|value date|booking date)$|date/i;
const DESC_H = /description|memo|name|payee|merchant|details|narrative|transaction|particulars/i;
const AMT_H = /^(amount|amt|transaction amount|value)$|^amount/i;
const DEBIT_H = /debit|withdrawal|money out|paid out|outflow|charge/i;
const CREDIT_H = /credit|deposit|money in|paid in|inflow/i;
const TYPE_H = /^type$|transaction type|dr\/cr|cr\/dr/i;

export function guessMapping(rows) {
  const empty = { hasHeader: false, date: -1, desc: -1, amount: -1, debit: -1, credit: -1, type: -1, flip: false };
  if (!Array.isArray(rows) || !rows.length || !Array.isArray(rows[0])) return empty;
  const header = rows[0].map((h) => String(h ?? "").trim());
  const idx = (re) => header.findIndex((h) => re.test(h));
  const m = { hasHeader: true, date: idx(DATE_H), desc: idx(DESC_H), amount: idx(AMT_H), debit: idx(DEBIT_H), credit: idx(CREDIT_H), type: idx(TYPE_H), flip: false };
  if (m.desc === m.date) m.desc = -1;
  // headerless files: sniff the first row for a date and a number
  const looksHeader = header.some((h) => /[a-z]/i.test(h) && !parseDate(h));
  if (!looksHeader) {
    m.hasHeader = false;
    m.date = rows[0].findIndex((c) => parseDate(c));
    m.amount = rows[0].findIndex((c, i) => i !== m.date && !isNaN(parseAmount(c)) && /\d/.test(c));
    m.desc = rows[0].findIndex((c, i) => i !== m.date && i !== m.amount && /[a-z]/i.test(c));
  }
  if (m.amount < 0 && m.debit < 0 && m.credit < 0 && m.hasHeader) {
    // pick the first column that is numeric in most rows
    const n = header.length;
    for (let c = 0; c < n; c++) {
      if (c === m.date || c === m.desc) continue;
      const vals = rows.slice(1, 20).map((r) => r[c]);
      if (vals.length && vals.filter((v) => /\d/.test(v || "") && !isNaN(parseAmount(v))).length >= vals.length * 0.8) { m.amount = c; break; }
    }
  }
  // Many card exports list spending as positive numbers. If nearly every amount is positive, offer a flip.
  if (m.amount >= 0) {
    const vals = rows.slice(m.hasHeader ? 1 : 0).map((r) => parseAmount(r[m.amount])).filter((v) => !isNaN(v));
    if (vals.length && vals.filter((v) => v > 0).length / vals.length > 0.9 && m.type < 0) m.flip = true;
  }
  return m;
}

export function parseDate(s) {
  if (!s) return null;
  s = String(s).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return iso(y, m[1], m[2]); }
  if ((m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/))) return iso(m[3], m[1], m[2]);
  if ((m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/))) return iso(m[3], m[2], m[1]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return iso(m[1], m[2], m[3]);
  if (!/[a-z]/i.test(s)) return null;
  const d = new Date(s);
  if (!isNaN(d)) return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return null;
}
function iso(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (!(y >= 1900 && y <= 2200) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  if (d > new Date(y, m, 0).getDate()) return null; // 31 Feb, 31 Apr
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function txHash(date, desc, amount) {
  const s = `${date}|${String(desc).toLowerCase().replace(/\s+/g, " ").trim()}|${toCents(amount)}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return "h" + (h >>> 0).toString(36);
}

// Amount for one row under mapping m. Returns { amount } or { reason } for the problem list; `zero` when it is 0.00.
export function rowAmount(r, m) {
  const cell = (i) => (i >= 0 && i < r.length ? r[i] : "");
  let amount = NaN;
  if (m.amount >= 0) {
    const raw = cell(m.amount);
    if (String(raw ?? "").trim() === "") return { reason: "no amount" };
    amount = parseAmount(raw);
    if (isNaN(amount)) return { reason: "bad amount" };
    if (m.type >= 0) {
      const t = String(cell(m.type) || "").toLowerCase();
      if (/debit|\bdr\b|withdraw|purchase|payment|charge/.test(t) && amount > 0) amount = -amount;
      if (/credit|\bcr\b|deposit/.test(t) && amount < 0) amount = -amount;
    }
    if (m.flip) amount = -amount;
  } else if (m.debit >= 0 || m.credit >= 0) {
    const dRaw = m.debit >= 0 ? String(cell(m.debit) ?? "").trim() : "";
    const cRaw = m.credit >= 0 ? String(cell(m.credit) ?? "").trim() : "";
    if (!dRaw && !cRaw) return { reason: "no amount" };
    const d = dRaw ? parseAmount(dRaw) : NaN;
    const c = cRaw ? parseAmount(cRaw) : NaN;
    if ((dRaw && isNaN(d)) || (cRaw && isNaN(c))) return { reason: "bad amount" };
    if (!isNaN(d) && d !== 0) amount = -Math.abs(d);
    else if (!isNaN(c) && c !== 0) amount = Math.abs(c);
    else amount = 0;
  } else return { reason: "no amount column" };
  if (!isFinite(amount) || Math.abs(amount) > MAX_AMOUNT) return { reason: "amount too large" };
  amount = Math.round(amount * 100) / 100;
  if (amount === 0) return { amount: 0, zero: true };
  return { amount };
}

// Build transactions from parsed rows under mapping m. Never throws.
// Returns:
//   tx           new transactions ready to push
//   problems     [{row, reason}] rows that could not be read: "no date" | "bad date" | "bad amount" | "no amount" |
//                "no amount column" | "amount too large" | "empty"
//   skipped      row numbers of the problems (kept for older callers)
//   empty        blank rows skipped (in the file and inside `rows`)
//   zero         rows with 0.00 skipped (not errors)
//   duplicates   total duplicate rows skipped (= dupInFile + dupExisting)
//   dupInFile    rows repeated inside this file
//   dupExisting  rows already in S.tx
export function buildTransactions(rows, m) {
  const out = [], problems = [];
  const res = { tx: out, problems, skipped: [], empty: 0, zero: 0, duplicates: 0, dupInFile: 0, dupExisting: 0 };
  if (!Array.isArray(rows)) return res;
  m = { date: -1, desc: -1, amount: -1, debit: -1, credit: -1, type: -1, flip: false, hasHeader: true, ...(m || {}) };
  for (const k of ["date", "desc", "amount", "debit", "credit", "type"]) m[k] = Number.isInteger(Number(m[k])) ? Number(m[k]) : -1;
  res.empty += Number(rows.emptyLines) || 0;
  const existing = new Set((S.tx || []).map((t) => t.hash));
  const inFile = new Set();
  const start = m.hasHeader ? 1 : 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = (r && r.line) || i + 1;
    if (!Array.isArray(r) || !r.some((x) => String(x ?? "").trim() !== "")) { res.empty++; continue; }
    const cell = (k) => (k >= 0 && k < r.length ? String(r[k] ?? "") : "");
    const dateRaw = cell(m.date).trim();
    const date = dateRaw ? parseDate(dateRaw) : null;
    if (!date) { problems.push({ row: rowNo, reason: dateRaw ? "bad date" : "no date" }); continue; }
    const desc = cell(m.desc).replace(/\s+/g, " ").trim() || "(no description)";
    const a = rowAmount(r, m);
    if (a.reason) { problems.push({ row: rowNo, reason: a.reason }); continue; }
    if (a.zero) { res.zero++; continue; }
    const amount = a.amount;
    const hash = txHash(date, desc, amount);
    if (inFile.has(hash)) { res.dupInFile++; continue; }
    if (existing.has(hash)) { res.dupExisting++; continue; }
    inFile.add(hash);
    let cat = "other";
    try { cat = guessCategory(desc, amount); } catch (e) { cat = amount > 0 ? "income" : "other"; }
    out.push({ id: uid(), date, desc, amount, cat, src: "csv", hash });
  }
  res.duplicates = res.dupInFile + res.dupExisting;
  res.skipped = problems.map((p) => p.row);
  return res;
}

// Short human summary for a build result, for any screen that wants one line.
export function summarize(r) {
  const parts = [`${r.tx.length} new`];
  if (r.dupExisting) parts.push(`${r.dupExisting} already in`);
  if (r.dupInFile) parts.push(`${r.dupInFile} repeated in the file`);
  if (r.zero) parts.push(`${r.zero} zero-amount`);
  if (r.empty) parts.push(`${r.empty} blank`);
  if (r.problems.length) parts.push(`${r.problems.length} unreadable`);
  return parts.join(" · ");
}
