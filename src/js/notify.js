// Text the person who delivers the coupons. Composer by default (sms: URI, one tap to send); automatic sending
// through the Android bridge when settings.notify.auto is on and the SMS permission was granted.
import { S } from "./state.js";
import { onEvent } from "./events.js";
import { isIOS } from "./platform.js";

function bridge() { return typeof window !== "undefined" && window.Glowstick ? window.Glowstick : null; }

// True when the Android app is present and exposes the silent-send method (not in a browser).
export function canAutoSend() {
  const b = bridge();
  if (!b || typeof b.sendSms !== "function") return false;
  // The store flavor's manifest has no SEND_SMS at all; the wrapper reports that so the toggle is not offered.
  try { if (typeof b.smsSupported === "function" && b.smsSupported() !== "1") return false; } catch (e) {}
  return true;
}
// True only when Android has granted SEND_SMS to this app. The store flavor never has it in its manifest, so
// this stays false there and the composer fallback is used.
export function hasSms() { try { return bridge()?.hasSms() === "1"; } catch (e) { return false; } }
// Ask Android for SEND_SMS (system dialog). Does nothing in a browser or in a flavor without the permission.
export function requestSms() { try { bridge()?.requestSms(); } catch (e) {} }
// "granted" | "denied" | "unavailable" — for the settings screen.
export function smsStatus() { return !canAutoSend() ? "unavailable" : hasSms() ? "granted" : "denied"; }

// The messaging-app link. Android (and desktop handlers) take "sms:<number>?body=<text>"; iOS wants
// "sms:<number>&body=<text>" and drops the text after "?". `ios` defaults to the real device.
export function smsUrl(num, text, ios = isIOS()) {
  return "sms:" + num + (ios ? "&" : "?") + "body=" + encodeURIComponent(text);
}

export function sendText(text) {
  const n = S.settings.notify || {};
  if (!n.phone) return false;
  const num = n.phone.replace(/[^\d+]/g, "");
  if (n.auto && canAutoSend() && hasSms()) {
    try { if (window.Glowstick.sendSms(num, text) === "1") return true; } catch (e) {}
  }
  try { window.location.href = smsUrl(num, text); return true; } catch (e) { return false; }
}

function who() { return S.settings.name || "They"; }

onEvent((ev) => {
  const n = S.settings.notify || {};
  if (!n.phone) return;
  if (ev.type === "coupon" && n.onEarn) setTimeout(() => sendText(`Glowstick: ${who()} drew "${ev.title}" (${ev.cat}). ${ev.note || ""}`.trim()), 1500);
  if (ev.type === "redeem" && n.onRedeem) sendText(`Glowstick: ${who()} is redeeming "${ev.title}" (${ev.cat}). ${ev.note || ""}`.trim());
});
