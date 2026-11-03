// Entry: wire tabs, register views, run the daily housekeeping, listen for game events.
import { storageProblem, rawSaved, exportJSON } from "./storage.js";
import { KEY } from "./state.js";
import { S, save, today } from "./state.js";
import { register, go, refresh } from "./router.js";
import * as home from "./ui/home.js";
import * as spend from "./ui/spend.js";
import * as bills from "./ui/bills.js";
import * as goals from "./ui/goals.js";
import * as loans from "./ui/loans.js";
import * as more from "./ui/more.js";
import * as income from "./ui/income.js";
import { h, toast, celebrate, reducedMotion } from "./ui/common.js";
import { onEvent, checkQuests, levelInfo, levelFor, checkGoalRewards } from "./game.js";
import { openDraw } from "./ui/coupons.js";
import { shouldShowIntro, showIntro } from "./ui/intro.js";
import { checkWeekWin, weekStatus } from "./impulse.js";
import { capFor } from "./budget.js";
import { byCategory, fullMonthsWithData } from "./analysis.js";
import { award, checkBadges } from "./game.js";
import { overdueCount, upcoming } from "./bills.js";
import * as notif from "./notif.js";
import { fmt0 } from "./money.js";
import { buzz } from "./haptics.js";
import "./notify.js";
import { peek } from "./ui/mascot.js";
import { newlyUnlocked } from "./cosmetics.js";

register("home", home); register("spend", spend); register("bills", bills);
register("goals", goals); register("loans", loans); register("more", more); register("income", income);

document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => go(b.dataset.tab)));

// Top-bar XP strip. drawXP() paints the current state; animateXP() runs the one-second charge-up
// after a gain: width eases toward the new fill, glow and jitter grow with the fill, a burst on level-up.
let shownFrac = null;
function drawXP() {
  const li = levelInfo();
  const el = document.getElementById("brand-sub");
  el.innerHTML = "";
  el.append(h("div", { class: "xp" }, h("span", { class: "lvl" }, "L" + li.level), h("div", { class: "bar lime" }, h("i", { style: { width: Math.round(li.frac * 100) + "%" } })), S.game.streak > 1 ? h("span", { class: "streak" }, "🔥" + S.game.streak) : null));
  shownFrac = li.frac;
}
let animToken = 0;
function animateXP(gain, from) {
  const li = levelInfo();
  const wrap = document.querySelector("#brand-sub .xp"); if (!wrap) { drawXP(); return; }
  const bar = wrap.querySelector(".bar > i");
  const leveled = li.level > from.level;
  const target = leveled ? 1 : li.frac;
  const start = from.frac, token = ++animToken, t0 = performance.now(), dur = 1000;
  wrap.classList.remove("burst");
  const g = h("span", { class: "gain" }, "+" + gain); wrap.append(g); setTimeout(() => g.remove(), 1000);
  // Reduced motion: no jitter, no glow ramp, no burst. The bar and level just become the new state.
  if (reducedMotion()) { bar.style.width = Math.round(target * 100) + "%"; setTimeout(() => { if (token === animToken) drawXP(); }, leveled ? 400 : 0); return; }
  wrap.classList.add("charging");
  let lastBuzz = 0;
  function frame(now) {
    if (token !== animToken) return;
    const t = Math.min(1, (now - t0) / dur);
    const e = t * t * (3 - 2 * t);                        // smoothstep
    const f = start + (target - start) * e;               // current fill
    const tension = Math.pow(f, 3) * (leveled ? 1.3 : 1); // anticipation: jitter climbs steeply near full
    const jx = (Math.random() - 0.5) * 5 * tension, jy = (Math.random() - 0.5) * 3 * tension;
    bar.style.width = (f * 100).toFixed(2) + "%";
    bar.style.transform = "translate(" + jx.toFixed(2) + "px, " + jy.toFixed(2) + "px)";
    wrap.style.setProperty("--f", Math.min(1, f + 0.15 * t).toFixed(3));
    // ticks of vibration that get closer together as the bar fills
    if (f > 0.5 && now - lastBuzz > 260 - 200 * f) { buzz(Math.round(6 + 14 * f)); lastBuzz = now; }
    if (t < 1) { requestAnimationFrame(frame); return; }
    bar.style.transform = "";
    if (leveled) {
      wrap.classList.add("burst");
      buzz([30, 40, 30, 40, 120]);
      setTimeout(() => { if (token === animToken) drawXP(); }, 550);
    } else {
      buzz(Math.round(15 + 40 * f));
      setTimeout(() => { if (token === animToken) { wrap.classList.remove("charging"); wrap.style.removeProperty("--f"); shownFrac = li.frac; } }, 250);
    }
  }
  requestAnimationFrame(frame);
}

// New mascot looks (js/cosmetics.js) are announced once, after the level-up / badge celebration.
let lastXpFrom = 0;
function announceLooks(items) {
  if (!items.length) return;
  toast("New mascot style unlocked: " + items.map((i) => i.name).join(", ") + " — More → Mascot");
  setTimeout(() => peek("success", { line: "New look unlocked." }), 3600);
}
onEvent((ev) => {
  if (ev.type === "xp") { lastXpFrom = S.game.xp - ev.n; const from = { level: levelFor(lastXpFrom), frac: shownFrac ?? 0 }; toast("+" + ev.n + " xp · " + ev.why, "xp"); animateXP(ev.n, from); }
  if (ev.type === "levelup") setTimeout(() => { celebrate("⚡", "Level " + ev.level + ": " + ev.name, "Keep going. The bar at the top is yours."); peek("levelup"); announceLooks(newlyUnlocked(lastXpFrom, S.game.xp)); }, 600);
  if (ev.type === "badge") { celebrate(ev.ico, "Badge: " + ev.name, ev.how); peek("badge"); announceLooks(newlyUnlocked(S.game.xp, S.game.xp, ev.id)); }
  if (ev.type === "coupon" || ev.type === "redeem") checkBadges();
  if (ev.type === "drawProgress") toast(`${ev.have} of ${ev.need} towards a coupon draw (${ev.why})`, "xp");
  if (ev.type === "draw") setTimeout(() => { celebrate("🎟", "Coupon draw earned", `${ev.why}. Pick a category and see what you get.`, () => { openDraw(); }); peek("coupon"); }, 300);
  if (ev.type === "milestone") { celebrate("◆", ev.goal + ": " + ev.pct + "%", ev.amount > 0 ? "Reward unlocked — " + fmt0(ev.amount) + " fun money is waiting in Goals." : "Reward unlocked in Goals."); peek(ev.pct >= 100 ? "goalDone" : "milestone"); }
  // streak: once per day, and only once it is actually a streak (2+ days)
  if (ev.type === "streak" && ev.streak > 1 && oncePerDay("streak")) setTimeout(() => peek("streak"), 1200);
});

// Peeks that happen at most once per calendar day (bill coming up, an allowance gone over, the streak).
function oncePerDay(key) {
  const p = (S.game.peeked = S.game.peeked || {});
  const t = today();
  if (p[key] === t) return false;
  p[key] = t; save();
  return true;
}
function dailyPeeks() {
  if (S.settings.mascot === false || shouldShowIntro()) return;
  const due = upcoming(2);
  if (due.length && oncePerDay("billSoon")) { setTimeout(() => peek("billSoon"), 900); return; }
  const over = weekStatus().some((w) => w.cap > 0 && w.left < 0);
  if (over && oncePerDay("overspend")) setTimeout(() => peek("overspend"), 900);
}

function housekeeping() {
  window.__overdueCount = overdueCount();
  for (const g of S.goals) checkGoalRewards(g);
  checkWeekWin();
  checkQuests();
  checkBadges();
  // last full month inside every cap that was set
  const lm = fullMonthsWithData(1)[0];
  if (lm && !(S.game.monthsChecked || {})[lm]) {
    (S.game.monthsChecked = S.game.monthsChecked || {})[lm] = true;
    const caps = S.categories.filter((c) => !["income", "savings", "other"].includes(c.id) && capFor(c.id) > 0);
    const spent = Object.fromEntries(byCategory(lm));
    if (caps.length && caps.every((c) => (spent[c.id] || 0) <= capFor(c.id))) award("underBudget");
    save();
  }
  const n = notif.pull();
  if (n) toast(n + " purchase" + (n === 1 ? "" : "s") + " captured — check the inbox");
}

housekeeping();
drawXP();
go("home");
if (shouldShowIntro()) setTimeout(() => showIntro(0), 400);
dailyPeeks();
document.addEventListener("visibilitychange", () => { if (!document.hidden) { housekeeping(); drawXP(); refresh(); dailyPeeks(); } });
window.GS = { S, save, refresh, go }; // test hook

function showStorageProblem() {
  document.getElementById("storage-problem")?.remove();
  const message = storageProblem(KEY); if (!message) return;
  const box = h("div", { id: "storage-problem", class: "card", role: "alert", style: { border: "2px solid var(--amber)", margin: "1rem" } },
    h("b", null, "Storage needs attention"), h("p", null, message),
    h("button", { class: "btn cyan", onclick: () => exportJSON(S, `glowstick-unsaved-${today()}.json`) }, "Export current session"),
    h("button", { class: "btn", onclick: () => { const raw = rawSaved(KEY); if (raw !== null) exportJSON({ originalSavedText: raw }, `glowstick-recovery-${today()}.json`); else toast("Original storage is not accessible"); } }, "Export original storage"),
    h("button", { class: "btn", onclick: () => { if (save()) toast("Changes saved"); else toast("Still unsaved; export before closing"); } }, "Retry saving"));
  document.body.prepend(box);
}
window.addEventListener("glowstick-storage", showStorageProblem);
showStorageProblem();
