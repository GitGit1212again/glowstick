// First-run walkthrough (six short slides) and the Help section under More.
// The permissions slide explains notification access (and, personal build only, SMS) BEFORE any Android dialog;
// "Not now" is a first-class choice. The last slide asks for the one thing needed now: monthly income.
import { S, save } from "../state.js";
import { h, modal, closeModal, card, numInput, toast } from "./common.js";
import { fmt0 } from "../money.js";
import { depositIncome } from "../analysis.js";
import { INCOME_FREQS, monthlyIncome, setIncomeEntered } from "../budget.js";
import { go, refresh } from "../router.js";
import { IS_STORE } from "../profile.js";
import { isIOS } from "../platform.js";
import * as notif from "../notif.js";
import { canAutoSend, hasSms, requestSms } from "../notify.js";
import { stickSVG, peek } from "./mascot.js";
import { checkBadges } from "../game.js";

// ---- progressive prompts: what is still missing, so screens can ask for it when it matters, not up front.
export function needsIncome() { return !(Number(S.settings.income) > 0); }
export function needsBills() { return !S.bills.length; }
export function needsGoal() { return !S.goals.length; }
export function needsAllowances() { const w = S.settings.impulse?.weekly || {}; return needsIncome() && !Object.values(w).some((v) => Number(v) > 0); }
export function needsPermissionChoice() { return notif.available() && !S.settings.sources?.notif && !S.settings.permAsked; }
// amount as typed + how often it comes; settings.income becomes the monthly equivalent. Returns the monthly figure.
export function setIncome(v, freq, mode) { if (mode) S.settings.incomeMode = mode; const n = setIncomeEntered(v, freq || S.settings.incomeFreq); save(); try { checkBadges(); } catch (e) {} return n; }
export function setIncomeMode(mode) { S.settings.incomeMode = mode === "deposits" ? "deposits" : "manual"; save(); }

// Amount + frequency inputs with a live "≈ $X a month" line. `read()` gives { amount, freq }.
export function incomeInputs(opts = {}) {
  const amt = numInput("income", S.settings.incomeEntered || S.settings.income || "", { placeholder: "e.g. 2400", min: "0", step: "1", "aria-label": "Take-home income" });
  const freq = h("select", { name: "incomeFreq", "aria-label": "How often" }, ...INCOME_FREQS.map((f) => h("option", { value: f.id, selected: (S.settings.incomeFreq || "monthly") === f.id }, f.label)));
  const derived = h("div", { class: "hint" });
  const update = () => { const m = monthlyIncome(amt.value, freq.value); derived.textContent = freq.value !== "monthly" && m > 0 ? `≈ ${fmt0(m)} a month` : ""; };
  amt.addEventListener("input", update); freq.addEventListener("change", update); update();
  // typed vs worked out from logged deposits
  const dep = depositIncome();
  const mode = h("select", { name: "incomeMode", "aria-label": "How to figure income" },
    h("option", { value: "manual", selected: S.settings.incomeMode !== "deposits" }, "I'll type it"),
    h("option", { value: "deposits", selected: S.settings.incomeMode === "deposits" }, "From my deposits"));
  const depLine = h("div", { class: "hint" });
  const typedRow = h("div", { class: "income-row" }, amt, freq);
  const applyMode = () => {
    const d = depositIncome();
    const on = mode.value === "deposits";
    amt.placeholder = on ? "expected per month (optional)" : "e.g. 2400";
    depLine.textContent = on
      ? (d.monthly > 0 ? `Deposits are averaging ${fmt0(d.monthly)} a month (${d.basis}). Type what you expect above and the app plans against that instead; leave it blank to plan against the average.`
                       : "No deposits logged yet. Type what you expect above, or leave it blank and the app will plan against your deposits once some are filed as Income.")
      : "";
  };
  mode.addEventListener("change", applyMode); applyMode();
  const el = h("div", { class: "field" }, opts.label ? h("label", null, opts.label) : null, mode, typedRow, derived, depLine, opts.hint ? h("div", { class: "hint" }, opts.hint) : null);
  return { el, amt, freq, mode, read: () => ({ amount: Number(amt.value) || 0, freq: freq.value, mode: mode.value }), update, hasDeposits: dep.monthly > 0 };
}
// A small inline nudge with a one-tap way to fix it. `text` says why it matters here.
export function incomeNudge(text) {
  return h("div", { class: "hold-meaning" }, h("div", { class: "small" }, text || "Set your monthly income and the app can tell you what's really free."), h("button", { class: "btn sm cyan", style: { marginTop: ".3rem" }, onclick: askIncome }, "Set income"));
}
export function askIncome(onDone) {
  const inc = incomeInputs();
  const body = h("div", null, h("p", { class: "small muted" }, "Take-home, after tax, and how often it comes. If it varies, use a low figure. Change it any time in More → Income & basics."), inc.el);
  modal("Your income", body, [
    h("button", { class: "btn ghost", onclick: closeModal }, "Skip for now"),
    h("button", { class: "btn primary", onclick: () => { const { amount, freq, mode } = inc.read(); if (mode === "deposits") { setIncomeMode("deposits"); setIncome(amount > 0 ? amount : 0, freq); closeModal(); toast("Income follows your deposits", "xp"); refresh(); onDone?.(); return; } if (!(amount > 0)) { toast("Enter a number, or skip"); return; } setIncome(amount, freq, "manual"); closeModal(); toast("Income set", "xp"); refresh(); onDone?.(); } }, "Save")]);
  setTimeout(() => inc.amt.focus(), 50);
}

const SLIDES = [
  { ico: "◉", title: "Glowstick", body: "Money that gets away from you, made visible. Spending in, bills lined up, a pause button for wants, and saving that feels like levelling up. Everything stays on this phone: no account, no server." },
  { ico: "＋", title: "How spending gets in", body: "Three ways, all optional:\n• tap + and type it\n• import your bank's CSV\n• let bank and wallet notifications file themselves (Android)\nNothing leaves the phone in any mode.",
    bodyIOS: "Two ways, both optional:\n• tap + and type it\n• import your bank's CSV\nNothing leaves the phone in any mode." },
  { ico: "⏳", title: "The hold, and allowances", body: "About to buy something? Tap Want something? first. It waits with you (10–60 minutes, your pick), shows what that money means for your goal, and then it's your call. Skip or buy, both are fine; both get logged.\nEating out, gaming and shopping each get a weekly allowance; Home shows what's left." },
  { ico: "⚡", title: "XP, quests, and a mascot", body: "Real actions fill the bar: logging, paying a bill, feeding a goal, letting a want sit. Opening the app earns nothing. Three quests a day, one of them for NOT spending. Good habits earn coupon draws from a real person. And this one shows up when something goes well:", mascot: true },
  { ico: "🔔", title: "Permissions", perms: true },
  { ico: "$", title: "One number to start", income: true },
];

export function shouldShowIntro() { return !S.settings.seenIntro; }

export function showIntro(startAt = 0) {
  // The permissions slide is only about Android notification access / SMS, so it is skipped on an iPhone or iPad.
  const ios = isIOS();
  const slides = SLIDES.filter((s) => !(s.perms && ios));
  let i = Math.max(0, Math.min(slides.length - 1, startAt));
  const body = h("div", { class: "intro" });
  const draw = () => {
    const s = slides[i];
    body.innerHTML = "";
    const last = i === slides.length - 1;
    const text = (ios && s.bodyIOS) || s.body;
    body.append(...[
      h("div", { class: "intro-ico" }, s.ico),
      h("h2", { class: "center" }, s.title),
      ...(text ? text.split("\n").map((line) => h("p", { class: line.startsWith("•") ? "small" : "" }, line)) : []),
      s.mascot ? h("div", { style: { display: "flex", justifyContent: "center" }, html: stickSVG("happy", "#c3ff3d", 120) }) : null,
      s.perms ? permsSlide(() => { i++; draw(); }) : null,
      s.income ? incomeSlide() : null,
      h("div", { class: "intro-dots" }, ...slides.map((_, k) => h("span", { class: k === i ? "on" : "" }))),
      h("div", { class: "actions" },
        i > 0 ? h("button", { class: "btn ghost", onclick: () => { i--; draw(); } }, "Back") : h("button", { class: "btn ghost", onclick: finish }, "Skip"),
        !last ? h("button", { class: "btn primary", onclick: () => { i++; draw(); } }, s.perms ? "Not now" : "Next") : null,
        last ? h("button", { class: "btn ghost", onclick: finish }, "Skip for now") : null,
        last ? h("button", { class: "btn primary", onclick: () => { const v = Number(body.querySelector("[name=income]")?.value); const fq = body.querySelector("[name=incomeFreq]")?.value; const md = body.querySelector("[name=incomeMode]")?.value; if (md === "deposits") { setIncomeMode("deposits"); setIncome(v > 0 ? v : 0, fq); toast("Income follows your deposits", "xp"); } else if (v > 0) { setIncome(v, fq, md === "deposits" ? "deposits" : "manual"); if (md !== "deposits") toast("Income set", "xp"); } finish(); refresh(); } }, "Done") : null)].filter(Boolean));
    if (s.mascot) setTimeout(() => peek("onboarding", { image: "stick" }), 300);
  };
  function finish() { S.settings.seenIntro = true; save(); closeModal(); }
  modal("", body);
  draw();
}

// What each permission does, in plain words, with the system dialog only behind an explicit button.
function permsSlide(next) {
  const el = h("div", { class: "small" });
  const onPhone = notif.available();
  el.append(h("p", { class: "small" }, "Both of these are optional. Nothing here is needed to use the app, and each can be switched on later under More."));
  el.append(h("p", { class: "small" }, h("b", null, "Notification access. "), "Lets Glowstick read your bank and wallet alerts on this phone so 'you spent $X at Y' files itself into the inbox for a one-tap confirm. Only notifications that look like money moving are kept; nothing is sent anywhere."));
  if (onPhone) el.append(h("div", { class: "row", style: { marginBottom: ".5rem" } },
    h("button", { class: "btn cyan sm grow", onclick: () => { S.settings.permAsked = true; S.settings.sources.notif = true; save(); notif.openAccess(); toast("Allow Glowstick on the Android screen, then come back"); } }, notif.hasAccess() ? "Notification access: granted" : "Open the Android screen"),
    h("button", { class: "btn ghost sm", onclick: () => { S.settings.permAsked = true; save(); next(); } }, "Not now")));
  else el.append(h("p", { class: "tiny dim" }, "Not on a phone right now, so there is nothing to grant here."));
  if (!IS_STORE) {
    el.append(h("p", { class: "small" }, h("b", null, "Send texts (personal build only). "), "When you redeem a coupon, the person who delivers it gets a text. By default your messaging app opens with the text ready and you press send. Granting SMS lets the app send it silently instead."));
    if (onPhone && canAutoSend()) el.append(h("div", { class: "row", style: { marginBottom: ".5rem" } },
      h("button", { class: "btn cyan sm grow", onclick: () => { S.settings.permAsked = true; save(); requestSms(); } }, hasSms() ? "SMS: granted" : "Ask Android for SMS"),
      h("button", { class: "btn ghost sm", onclick: () => { S.settings.permAsked = true; save(); next(); } }, "Not now")));
  }
  return el;
}

function incomeSlide() {
  return h("div", null,
    h("p", null, "Your take-home, and how often it lands. Goals, 'free cash' and the allowances are measured against the monthly figure. Everything else can wait."),
    incomeInputs().el,
    h("p", { class: "tiny dim center", style: { marginTop: ".4rem" } }, "Rough is fine. Change it any time in More → Income & basics."));
}

const TIPS = [
  ["Home", "The two big numbers are this month's spend and what's free after typical spending. Below: this week's allowances, the Want Something hold, quests, coupon draws, bills due in 7 days, goals, and what the numbers say."],
  ["Spend", "Arrows change month. Tap a category bar to filter the list. Patterns shows which weekdays cost the most and your top places. Inbox is where captured notifications wait for a one-tap confirm."],
  ["Income", "Deposits this month against what's expected, the figure the app plans with (typed, or worked out from your deposits), next paydays, and a log-a-deposit button. Paychecks filed as Income feed all of it."],
  ["Bills", "Add anything monthly. Paid logs the transaction and ticks the month. CSV imports tick bills automatically when a matching charge shows up. Recurring charges the app spots are offered at the bottom."],
  ["Goals", "New goal → Negotiate: pick Easy/Steady/All-in or drag the monthly amount or the finish date. Add money as you transfer it for real. Milestones at 25/50/75/100% unlock fun money or a reward from your list."],
  ["Loans", "Balance, APR, minimum payment. Slide 'Extra per month' to see months and interest saved. 'Pay off by…' solves for the extra you'd need. Log a payment reduces the balance."],
  ["Want Something", "Log the thing and its price, pick how long to wait (10–60 min). Tap the hold to see the countdown and what the money means. Skip = +25 XP and the amount goes to your 'not spent' pile, which you can sweep into a goal. Buy = logged, no penalty."],
  ["Quests", "Two action quests and one restraint quest a day. Action quests need something you did today; opening the app earns nothing. Restraint quests (no takeout today, inside today's slice, no-spend day) are scored the next morning and only count on days you used the app."],
  ["Coupons", "Habits earn draws (the ramp makes later draws take a bit more). Draw a card → pick a category → random card → it waits in the wallet. Tap a card, Redeem, and the person delivering it gets a text. Edit the deck under More → Rewards."],
  ["Filing rules", "On any transaction, tick 'Always file … here' and every future match goes to that category. Manage them under More → Filing rules."],
  ["Mascot", "Shows up bottom-right when something goes well. With no pictures it is the glowstick itself; add your own under More → Mascot, or switch it off there."],
  ["Backup", "More → Backup & reset exports everything as one file. Uninstalling deletes the data; the backup is the only copy that survives. Mascot pictures are not in the backup."],
];

export function helpSection() {
  return card(null, "",
    h("button", { class: "btn cyan block mb", onclick: () => showIntro(0) }, "Show the walkthrough again"),
    ...TIPS.map(([t, b]) => h("details", { class: "tip" }, h("summary", null, t), h("p", { class: "small muted" }, b))));
}
