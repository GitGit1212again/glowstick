// iPhone/Safari behaviour that can be checked without a browser: platform probes and the sms: link shape.
import { test } from "node:test";
import assert from "node:assert/strict";
const records = new Map();
globalThis.localStorage = { getItem: (k) => records.get(k) ?? null, setItem: (k, v) => records.set(k, String(v)) };
const { isIOS, canVibrate } = await import("../src/js/platform.js");
const { smsUrl } = await import("../src/js/notify.js");
const { buzz } = await import("../src/js/haptics.js");

const IPHONE = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1", platform: "iPhone", maxTouchPoints: 5 };
const IPAD_AS_MAC = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 5 };
const MAC = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15", platform: "MacIntel", maxTouchPoints: 0 };
const ANDROID = { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S918U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36", platform: "Linux armv81", maxTouchPoints: 5, vibrate() {} };

test("iOS is recognised on iPhone and on iPad that reports itself as a Mac, not on a Mac or Android", () => {
  assert.equal(isIOS(IPHONE), true);
  assert.equal(isIOS(IPAD_AS_MAC), true);
  assert.equal(isIOS(MAC), false);
  assert.equal(isIOS(ANDROID), false);
  assert.equal(isIOS(null), false);
});

test("vibration is offered only where the API exists", () => {
  assert.equal(canVibrate(ANDROID), true);
  assert.equal(canVibrate(IPHONE), false);
  assert.equal(canVibrate(null), false);
  assert.doesNotThrow(() => buzz([10, 20, 10])); // Node has no navigator.vibrate; the call is silently skipped
});

test("sms link: iOS uses &body=, everything else ?body=, text is percent-encoded", () => {
  const text = 'Glowstick: they drew "Movie night" (Food). Snacks & a film?';
  assert.equal(smsUrl("+15551234567", text, true), "sms:+15551234567&body=" + encodeURIComponent(text));
  assert.equal(smsUrl("+15551234567", text, false), "sms:+15551234567?body=" + encodeURIComponent(text));
  assert.ok(!smsUrl("5551234567", "a b", true).includes("?"));
  assert.ok(!smsUrl("5551234567", "a b", false).includes("&"));
});
