// Small browser/device probes. Every function takes the navigator to look at as an argument so it can be tested
// without a browser; with no argument it reads the real one (and answers "no" where there is none).
function realNav() { return typeof navigator !== "undefined" ? navigator : null; }

// iPhone, iPod and iPad. iPadOS 13+ reports itself as a Mac, so a "Mac" with a touch screen counts too.
export function isIOS(nav = realNav()) {
  if (!nav) return false;
  if (/iPhone|iPad|iPod/i.test(nav.userAgent || "")) return true;
  return nav.platform === "MacIntel" && (nav.maxTouchPoints || 0) > 1;
}

// Safari on iOS has no Vibration API; neither do some desktop browsers. The vibration switch is only shown when
// the call exists, and buzz() already ignores the call when it does not.
export function canVibrate(nav = realNav()) { return !!nav && typeof nav.vibrate === "function"; }
