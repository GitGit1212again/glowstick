// Home-screen impulse card: weekly allowances, the "Want something?" hold, and the not-spent pile.
// Tapping a hold opens a full-screen sheet: countdown ring, what the money means, and the two choices.
// One 1-second tick (only while a hold exists) redraws the compact rows and, if open, the sheet.
import { S, save, catName } from "../state.js";
import { fmt, fmt0 } from "../money.js";
import { h, card, bar, field, input, numInput, catSelect, readForm, modal, closeModal, toast, celebrate, catDot } from "./common.js";
import { weekStatus, daysLeftInWeek, startHold, activeHolds, holdReady, holdLeftMs, holdFrac, holdCountdown, resolveHold, dropHold, meaning, sweepNotSpent, HOLD_CHOICES, defaultHoldMinutes, HOLD_EMPTY } from "../impulse.js";
import { remaining } from "../goal.js";
import { needsIncome, incomeNudge } from "./intro.js";
import { peek } from "./mascot.js";
import { refresh, go } from "../router.js";

let timer = null;

export function impulseCard() {
  const ws = weekStatus();
  const holds = activeHolds();
  const dl = daysLeftInWeek();
  const el = card(`This week · ${dl} day${dl === 1 ? "" : "s"} left`, "accent-amber",
    ws.length ? ws.map((w) => h("div", { style: { marginBottom: ".5rem" } },
      h("div", { class: "row between small" }, h("span", { class: "row" }, catDot(w.cat), catName(w.cat)), w.cap ? h("b", { class: w.left < 0 ? "amber" : "lime" }, w.left >= 0 ? `${fmt0(w.left)} left` : `${fmt0(-w.left)} past it`) : h("span", { class: "muted" }, `${fmt0(w.spent)} · no allowance set`)),
      w.cap ? bar(w.frac, "amber thin") : null)) : h("p", { class: "small muted" }, "Set weekly allowances for the categories that run away with you in More → Impulse."),
    holds.length
      ? h("div", { class: "mt" }, ...holds.map(holdRow))
      : h("div", { class: "hold-empty mt" }, h("b", null, HOLD_EMPTY.what), h("span", null, HOLD_EMPTY.why), h("span", { class: "dim" }, HOLD_EMPTY.next)),
    h("div", { class: "row mt" },
      h("button", { class: "btn primary grow", onclick: openHold }, "⏳ Want something?"),
      S.game.notSpent > 0 ? h("button", { class: "btn lime", onclick: sweep }, `Sweep ${fmt0(S.game.notSpent)} not spent`) : null));
  stopTimer();
  if (holds.length) timer = setInterval(tick, 1000);
  return el;
}
export function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }

function tick() {
  const holds = activeHolds();
  if (!holds.length) { stopTimer(); return; }
  document.querySelectorAll("[data-hold]").forEach((r) => { const u = holds.find((x) => x.id === r.dataset.hold); if (u) r.replaceWith(holdRow(u)); });
  const sheet = document.querySelector("[data-hold-sheet]");
  if (sheet) { const u = holds.find((x) => x.id === sheet.dataset.holdSheet); if (u) updateSheet(sheet, u); else closeModal(); }
}

// compact row on the card; tap opens the sheet
function holdRow(u) {
  const ready = holdReady(u);
  return h("div", { class: "quest tap", "data-hold": u.id, onclick: () => openSheet(u) },
    h("div", { class: "ico" }, ring(u, 34)),
    h("div", { class: "body" }, h("b", null, `${u.desc || catName(u.cat)} · ${fmt0(u.amount)}`), h("span", null, ready ? "Time's up. Your call." : `${holdCountdown(u)} to sit with it`)),
    h("span", { class: "tiny dim" }, ready ? "decide ›" : "open ›"));
}

// SVG countdown ring: fills as the wait passes. Radius/size in px.
function ring(u, size) {
  const frac = holdFrac(u), r = (size - 6) / 2, c = 2 * Math.PI * r;
  const ready = holdReady(u);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`); svg.setAttribute("width", size); svg.setAttribute("height", size); svg.setAttribute("class", "hold-ring" + (ready ? " ready" : ""));
  svg.innerHTML = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="4"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${ready ? "var(--lime)" : "var(--amber)"}" stroke-width="4" stroke-linecap="round" transform="rotate(-90 ${size / 2} ${size / 2})" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - frac)).toFixed(2)}" style="transition: stroke-dashoffset .9s linear"/>` +
    (size >= 100 ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" fill="currentColor" font-size="${Math.round(size / 5.5)}" font-weight="800">${ready ? "✓" : holdCountdown(u)}</text>` : "");
  return svg;
}

// ---- full-screen sheet for one hold
function openSheet(u) {
  const body = h("div", { class: "hold-sheet", "data-hold-sheet": u.id });
  const sheet = modal("", body);
  sheet.classList.add("hold-full");
  updateSheet(body, u, true);
  if (!timer) timer = setInterval(tick, 1000);
}
function updateSheet(body, u, first) {
  const ready = holdReady(u);
  const wasReady = body.dataset.ready === "1";
  if (!first && ready === wasReady) { // only the ring and the clock move between renders
    const old = body.querySelector(".hold-ring"); if (old) old.replaceWith(ring(u, 168));
    const t = body.querySelector(".hold-clock"); if (t) t.textContent = ready ? "Time's up." : holdCountdown(u) + " left";
    return;
  }
  body.dataset.ready = ready ? "1" : "0";
  const m = meaning(u.amount);
  body.innerHTML = "";
  body.append(...[
    h("div", { class: "hold-head" }, h("div", { class: "tiny muted" }, "ON HOLD · " + catName(u.cat)), h("h2", null, u.desc || catName(u.cat)), h("div", { class: "hold-amt" }, fmt(u.amount))),
    h("div", { class: "hold-ringwrap" }, ring(u, 168)),
    h("div", { class: "hold-clock " + (ready ? "lime" : "amber") }, ready ? "Time's up." : holdCountdown(u) + " left"),
    h("p", { class: "small muted center" }, ready ? "No wrong answer here. Whichever way, it was a choice and not a reflex." : `You gave this ${u.minutes || defaultHoldMinutes()} minutes. Nothing to do but let it sit.`),
    m.length ? h("div", { class: "hold-meaning" }, h("div", { class: "tiny muted" }, "WHAT THAT MONEY IS"), ...m.map((line) => h("div", { class: "small" }, "• " + line))) : (needsIncome() ? incomeNudge("Set your income and this will show what the money means for you.") : null),
    ready
      ? h("div", { class: "hold-actions" },
        h("button", { class: "btn lime block", onclick: () => finish(u, false) }, `Let it go · keep ${fmt0(u.amount)}`),
        h("button", { class: "btn block", onclick: () => finish(u, true) }, "Buy it · log it"))
      : h("div", { class: "hold-actions" },
        h("button", { class: "btn ghost block", onclick: () => { dropHold(u); closeModal(); refresh(); toast("Dropped. Nothing logged."); } }, "Never mind, drop it"),
        h("button", { class: "btn ghost sm block", onclick: () => finish(u, true) }, "Need it now — buy and log")),
    h("button", { class: "btn ghost sm block", style: { marginTop: ".4rem" }, onclick: () => { closeModal(); } }, "Back to Home, keep waiting")].filter(Boolean));
}
function finish(u, bought) {
  const line = resolveHold(u, bought);
  closeModal();
  toast(line || (bought ? "Logged." : "Kept."), bought ? "" : "xp");
  if (!bought) peek("hold");
  refresh();
}

// ---- new hold
function openHold() {
  const imp = S.settings.impulse || {};
  let mins = defaultHoldMinutes();
  const chips = h("div", { class: "chips" }, ...[...new Set([...HOLD_CHOICES, mins])].sort((a, b) => a - b).map((n) => h("button", { type: "button", class: "chip" + (n === mins ? " active" : ""), "data-min": n, onclick: (e) => { mins = n; chips.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", Number(c.dataset.min) === mins)); go_.textContent = `Hold it ${mins} min`; } }, n + " min")));
  const body = h("div", null,
    h("div", { class: "field-row" }, field("What", input("desc", "", { placeholder: "Pizza, skin, DLC…" })), field("How much", numInput("amount", "", { min: "0" }))),
    field("Category", catSelect("cat", imp.cats?.[0] || "eating")),
    field("How long to sit with it", chips, "Long enough for the itch to pass; short enough that you'll actually wait."),
    h("div", { id: "meaning", class: "small muted" }));
  const amtIn = body.querySelector("[name=amount]");
  amtIn.addEventListener("input", () => { const m = meaning(Number(amtIn.value) || 0); body.querySelector("#meaning").textContent = m.length && amtIn.value ? "That's " + m.join(", or ") + "." : ""; });
  const go_ = h("button", { class: "btn primary", onclick: () => {
    const f = readForm(body);
    if (!f.amount || f.amount <= 0) { toast("How much is it?"); return; }
    const u = startHold((f.desc || "").trim(), f.amount, f.cat, mins);
    closeModal(); refresh();
    toast(`On hold for ${mins} min. +${5} xp for pausing.`, "xp");
    openSheet(u);
  } }, `Hold it ${mins} min`);
  modal("Want something?", body, [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"), go_]);
  setTimeout(() => body.querySelector("[name=desc]").focus(), 50);
}

function sweep() {
  const live = S.goals.filter((g) => remaining(g) > 0);
  if (!live.length) { toast("Make a goal first, then sweep into it"); go("goals"); return; }
  const body = h("div", null, h("p", null, `Move ${fmt(S.game.notSpent)} of skipped wants into a goal. Do the real transfer at your bank too, so the number is true.`),
    field("Goal", h("select", { name: "goal" }, ...live.map((g) => h("option", { value: g.id }, g.name)))));
  modal("Sweep not-spent money", body, [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"), h("button", { class: "btn lime", onclick: () => {
    const g = S.goals.find((x) => x.id === readForm(body).goal);
    const amt = sweepNotSpent(g);
    closeModal();
    celebrate("◆", fmt(amt) + " moved", `${g.name} just got ${fmt(amt)} of money you chose not to burn.`, refresh);
  } }, "Sweep")]);
}
