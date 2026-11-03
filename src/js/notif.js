// Notification capture. On Android the APK exposes window.Glowstick (see android/.../MainActivity.kt):
//   hasAccess()          -> "1" if notification access is granted
//   openAccess()         -> opens the system Notification access screen
//   pull()               -> JSON array of {id, pkg, app, title, text, time} captured since last ack
//   ack(idsJson)         -> drop those ids from the phone-side queue
//   apps()               -> JSON array of {pkg, app, count} seen posting notifications
// In a plain browser none of this exists and the feature simply shows as unavailable.
import { S, save, uid, toISO } from "./state.js";
import { guessCategory } from "./categorize.js";
import { txHash } from "./csv.js";

export function bridge() { return typeof window !== "undefined" && window.Glowstick ? window.Glowstick : null; }
export function available() { return !!bridge(); }
export function hasAccess() { try { return bridge()?.hasAccess() === "1"; } catch (e) { return false; } }
export function openAccess() { try { bridge()?.openAccess(); } catch (e) {} }
export function seenApps() { try { return JSON.parse(bridge()?.apps() || "[]"); } catch (e) { return []; } }

const AMT = /(?:\$|USD\s?|US\$)\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+(?:\.\d{2})?)|(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s?(?:USD|dollars)/i;
const MERCH = /\b(?:at|to|from|with|for|@)\s+([A-Za-z0-9][^\n]*?)(?=\s+(?:on|for|using|with|was|has|is|from|via|ending|card)\b|\s*[.,;!—–]\s|\s*[.,;!—–]?$)/;
const CREDIT = /received|deposit|deposited|refund|credited|payment received|sent you|paid you|cash back|cashback/i;
const IGNORE = /otp|one-time|verification|code|password|login|sign in|security alert|statement is ready|balance is|available balance|low balance|reminder|due|payment due|autopay scheduled/i;

// Turn a notification into a candidate transaction, or null if it doesn't look like money moving.
export function parseNotification(n) {
  const text = [n.title, n.text].filter(Boolean).join(" — ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const m = text.match(AMT);
  if (!m) return null;
  if (IGNORE.test(text) && !/spent|purchase|charged|paid|transaction/i.test(text)) return null;
  const amt = parseFloat((m[1] || m[2]).replace(/,/g, ""));
  if (!isFinite(amt) || amt <= 0) return null;
  const sign = CREDIT.test(text) ? 1 : -1;
  let merchant = "";
  const mm = text.match(MERCH);
  if (mm) merchant = mm[1].trim().replace(/\s+(?:on|for|using|with|was|has|is|from)$/i, "");
  if (/^(?:your|the|a|an)\b/i.test(merchant) || merchant.length < 2) merchant = "";
  if (!merchant) merchant = (n.title || n.app || "Purchase").trim();
  const date = toISO(new Date(n.time || Date.now()));
  return { id: uid(), notifId: n.id, pkg: n.pkg, app: n.app, date, desc: merchant, amount: sign * amt, cat: guessCategory(merchant, sign * amt), raw: text };
}

// Pull from the phone, parse, queue for review. Returns how many new candidates were added.
export function pull() {
  const b = bridge();
  if (!b || !S.settings.sources.notif) return 0;
  let list = [];
  try { list = JSON.parse(b.pull() || "[]"); } catch (e) { return 0; }
  if (!list.length) return 0;
  const allowed = new Set(S.settings.notifApps || []);
  const seen = new Set([...S.pending.map((p) => p.notifId), ...S.tx.map((t) => t.notifId).filter(Boolean)]);
  let added = 0;
  for (const n of list) {
    if (seen.has(n.id)) continue;
    if (allowed.size && !allowed.has(n.pkg)) continue;
    const c = parseNotification(n);
    if (!c) continue;
    const h = txHash(c.date, c.desc, c.amount);
    if (S.tx.some((t) => t.hash === h)) continue;
    S.pending.push(c);
    added++;
  }
  try { b.ack(JSON.stringify(list.map((n) => n.id))); } catch (e) {}
  if (added) save();
  return added;
}
