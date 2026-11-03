// Goals: savings targets, the negotiation (amount per month vs finish date), milestones and rewards.
import { S, save, uid, today, thisMonth, addMonths, monthLabel, catName } from "../state.js";
import { fmt, fmt0 } from "../money.js";
import { h, card, section, bar, emptyState, field, input, numInput, readForm, modal, closeModal, toast, toastUndo, confirmBox, celebrate } from "./common.js";
import { available, remaining, isDone, progress, monthsFor, dateAfterMonths, monthsUntil, verdict, offers, whereToCut, MILESTONES, addToGoal } from "../goal.js";
import { checkGoalRewards, claimMoney, claimListItem, addXP, XP, touch, checkQuests, rewardAmount } from "../game.js";
import { txHash } from "../csv.js";
import { refresh, go } from "../router.js";

export function render(root) {
  const av = available();
  root.append(av.income
    ? h("div", { class: "card stat big primary " + (av.available < 0 ? "accent-danger danger" : "accent-cyan info") }, h("div", { class: "label" }, "Free for goals each month"),
      h("div", { class: "value" }, (av.available < 0 ? "−" : "") + fmt0(Math.abs(av.available))),
      h("div", { class: "sub" }, `${fmt0(av.income)} income − ${fmt0(av.fixed)} bills & loan minimums − ${fmt0(av.habits)} everyday spending − ${fmt0(av.committed)} already promised to goals / loan extras`))
    : section("Free for goals each month", { level: "primary", accent: "cyan" }, emptyState({ ico: "◆", title: "No income set", why: "Goals are checked against what is really free each month, which starts from income.", action: { label: "Set income", cls: "cyan", onclick: () => go("more") } })));

  // rewards to claim
  for (const c of S.game.claimable) root.append(rewardCard(c));

  // fun money wallet
  if (S.game.funMoney > 0 || S.game.funLog.length) root.append(card("Fun money", "reward-wallet tertiary accent-amber", h("div", { class: "row between" }, h("div", { class: "stat" }, h("div", { class: "value" }, fmt0(S.game.funMoney)), h("div", { class: "sub" }, "earned from milestones · spend it guilt-free by ticking 'pay from fun money' on a transaction")),
    h("button", { class: "btn sm ghost", onclick: showFunLog }, "History"))));

  const live = S.goals.filter((g) => !isDone(g)), done = S.goals.filter(isDone);
  root.append(...live.map(goalCard));
  if (!S.goals.length) root.append(section("Goals", { accent: "cyan" }, emptyState({ ico: "◆", title: "No goals yet", why: "Pick an amount; the app works out how long it really takes and what has to give to get there.", action: { label: "New goal", cls: "primary", onclick: () => openGoalForm() } })));
  else if (!live.length) root.append(section("Goals", { accent: "cyan" }, emptyState({ ico: "◆", title: "Everything is saved", why: "All your goals are done. The next one starts from what is free above.", action: { label: "New goal", cls: "primary", onclick: () => openGoalForm() } })));
  if (S.goals.length) root.append(h("button", { class: "btn primary block mb", onclick: () => openGoalForm() }, "+ New goal"));
  if (done.length) root.append(card("Done", "", h("ul", { class: "list" }, ...done.map((g) => h("li", null, h("div", { class: "main" }, h("div", { class: "title lime" }, "◆ " + g.name), h("div", { class: "meta" }, `${fmt0(g.target)} · finished ${g.milestones?.[100] || ""}`)), h("button", { class: "btn sm ghost icon", "aria-label": "Remove " + g.name, title: "Remove", onclick: () => confirmBox(`Remove the finished goal "${g.name}" from this list? Its savings transfers stay in your transactions.`, () => { const idx = S.goals.indexOf(g); S.goals = S.goals.filter((x) => x.id !== g.id); save(); refresh(); toastUndo(`Removed ${g.name}`, () => { S.goals.splice(Math.min(idx, S.goals.length), 0, g); save(); refresh(); }); }, "Remove", { title: "Remove goal", undoable: true }) }, "✕"))))));
}

function goalCard(g) {
  const p = progress(g), rem = remaining(g);
  const monthly = Number(g.monthly) || 0;
  const n = monthsFor(g, monthly);
  const av = available(g.id).available + monthly; // what this goal could use
  const v = verdict(monthly, av);
  const eta = isFinite(n) ? dateAfterMonths(n) : null;
  const behind = g.due && eta && eta > g.due;
  return h("section", { class: "card goal-card" },
    h("div", { class: "card-head" }, h("h2", { style: { margin: 0 } }, g.name), h("button", { class: "btn sm ghost", "aria-label": "Edit " + g.name, onclick: () => openGoalForm(g) }, "Edit")),
    h("div", { class: "row between" }, h("span", { class: "big" }, fmt0(g.saved || 0)), h("span", { class: "muted" }, "of " + fmt0(g.target))),
    bar(p, "lime", g.name + " progress"),
    h("div", { class: "milestones" }, ...MILESTONES.map((m) => h("span", { class: p * 100 >= m ? "hit" : "" }, m + "%"))),
    h("p", { class: "small", style: { marginTop: ".6rem" } }, h("b", null, fmt0(rem)), " to go · ", h("b", null, fmt0(monthly)), " a month → ", h("b", { class: behind ? "amber" : "" }, eta ? monthLabel(eta, true) : "never at this rate"), g.due ? h("span", { class: "muted" }, ` (target ${monthLabel(g.due, true)})`) : null),
    h("div", { class: "negotiate" }, h("div", { class: "verdict " + v.level }, v.text)),
    h("div", { class: "row" },
      h("button", { class: "btn lime grow", onclick: () => addMoney(g) }, "+ Add money"),
      h("button", { class: "btn cyan grow", onclick: () => negotiate(g) }, "Negotiate plan")),
    h("p", { class: "tiny dim", style: { marginTop: ".5rem" } }, `Next milestone reward: about ${fmt0(rewardAmount(g))} fun money${S.settings.rewards.mode !== "money" ? " or a pick from your list" : ""}.`));
}

function addMoney(g) {
  const body = h("div", null,
    h("div", { class: "field-row" }, field("Amount", numInput("amount", g.monthly || "", { min: "0" })), field("Date", input("date", today(), { type: "date" }))),
    h("label", { class: "check" }, h("input", { type: "checkbox", name: "logtx", checked: true }), h("span", null, "Also log it as a 'Savings transfer' transaction")));
  modal("Add to " + g.name, body, [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"), h("button", { class: "btn lime", onclick: () => {
    const f = readForm(body);
    if (!f.amount || f.amount <= 0) { toast("Enter an amount"); return; }
    const date = f.date || today();
    const added = addToGoal(g, f.amount, null, date);
    if (f.logtx) { const desc = "To " + g.name; S.tx.push({ id: uid(), date, desc, amount: -added, cat: "savings", src: "manual", hash: txHash(date, desc, -added), logged: today(), goalId: g.id }); }
    save(); touch();
    addXP(XP.goalAdd + Math.min(50, Math.floor(added / 10) * XP.goalPer10), "added to goal");
    checkGoalRewards(g); checkQuests();
    closeModal(); refresh();
  } }, "Add")]);
}

function negotiate(g) {
  const av = available(g.id).available;
  const rem = remaining(g);
  let monthly = Number(g.monthly) || Math.max(0, Math.floor(av * 0.5 / 5) * 5);
  let due = g.due || dateAfterMonths(monthsFor(g, monthly) || 1);
  const maxMonthly = Math.max(50, Math.ceil(Math.max(av * 1.5, monthly * 1.5, rem / 3) / 10) * 10);
  // The structure is built ONCE. The slider and the month picker stay in place; only the dependent parts
  // (offers highlight, label, verdict, summary, cuts) are re-rendered, so a drag on the slider is never interrupted.
  const offersEl = h("div", { class: "plan-options" });
  const label = h("label", null, "");
  const range = h("input", { type: "range", min: 0, max: maxMonthly, step: 5, value: monthly, "aria-label": "Amount per month" });
  const monthIn = h("input", { type: "month", value: due || "", min: addMonths(thisMonth(), 1), "aria-label": "Finish by" });
  const verdictEl = h("div", { class: "verdict" });
  const summary = h("p", { class: "small" });
  const cutsEl = h("div", null);
  const update = () => {
    const n = monthsFor(g, monthly);
    const eta = isFinite(n) ? dateAfterMonths(n) : null;
    const v = verdict(monthly, av);
    const cuts = monthly > av ? whereToCut(monthly - av) : [];
    offersEl.innerHTML = "";
    offersEl.append(...offers(g).map((o) => h("button", { type: "button", class: monthly === o.monthly ? "active" : "", disabled: !o.feasible, onclick: () => { monthly = o.monthly; due = o.date; range.value = monthly; monthIn.value = due || ""; update(); } }, h("b", null, fmt0(o.monthly) + "/mo"), h("small", null, o.label + " · " + (isFinite(o.months) ? o.months + " mo" : "—")))));
    label.textContent = `Per month: ${fmt0(monthly)}`;
    verdictEl.className = "verdict " + v.level; verdictEl.textContent = v.text;
    summary.innerHTML = "";
    summary.append(isFinite(n) && n > 0 ? h("span", null, "At ", h("b", null, fmt0(monthly)), " a month you finish in ", h("b", null, n + " month" + (n === 1 ? "" : "s")), " (", monthLabel(eta, true), ").") : "Pick an amount above zero.");
    cutsEl.innerHTML = "";
    if (cuts.length) cutsEl.append(h("h3", null, "Where the gap could come from"), h("ul", { class: "list" }, ...cuts.map((c) => h("li", null, h("div", { class: "main" }, h("div", { class: "title" }, catName(c.cat)), h("div", { class: "meta" }, `you average ${fmt0(c.avg)} a month`)), h("div", { class: "amt amber" }, "−" + fmt0(c.cut))))));
  };
  // input = live while dragging (no DOM rebuild around the slider); change = pointer released, same update
  range.addEventListener("input", () => { monthly = Number(range.value); due = dateAfterMonths(monthsFor(g, monthly)) || due; monthIn.value = due || ""; update(); });
  range.addEventListener("change", update);
  monthIn.addEventListener("change", () => { if (!monthIn.value) return; due = monthIn.value; monthly = Math.ceil(rem / monthsUntil(due) / 5) * 5; range.value = Math.min(maxMonthly, monthly); update(); });
  const body = h("div", null,
    h("p", { class: "small muted" }, `${fmt0(rem)} still needed. ${av > 0 ? fmt0(av) + " a month is free right now." : "Nothing is free right now."}`),
    h("h3", null, "Offers"), offersEl,
    h("h3", { class: "mt" }, "Or set it yourself"),
    h("div", { class: "field" }, label, range),
    h("div", { class: "field" }, h("label", null, "Finish by"), monthIn),
    h("div", { class: "negotiate" }, verdictEl),
    summary, cutsEl,
    h("div", { class: "actions" }, h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"), h("button", { class: "btn primary", onclick: () => { g.monthly = monthly; g.due = due; save(); closeModal(); refresh(); toast("Plan set"); } }, "Agree")));
  update();
  modal("Negotiate: " + g.name, body);
}

export function openGoalForm(g) {
  const isNew = !g || !g.id;
  const v = { name: "", target: null, saved: 0, ...(g || {}) };
  const body = h("div", null,
    field("What for", input("name", v.name, { placeholder: "Emergency fund, trip, new tyres…" })),
    h("div", { class: "field-row" }, field("Target", numInput("target", v.target)), field("Already saved", numInput("saved", v.saved))));
  const actions = [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel")];
  if (!isNew) actions.push(h("button", { class: "btn danger", onclick: () => confirmBox(`Delete the goal "${g.name}" (${fmt0(g.saved || 0)} saved of ${fmt0(g.target)})? Money already moved stays in your transactions; only the goal and its plan go.`, () => {
    const idx = S.goals.indexOf(g);
    S.goals = S.goals.filter((x) => x.id !== g.id); save(); closeModal(); refresh();
    toastUndo(`Deleted ${g.name}`, () => { S.goals.splice(Math.min(idx, S.goals.length), 0, g); save(); refresh(); });
  }, "Delete", { title: "Delete goal", undoable: true }) }, "Delete"));
  actions.push(h("button", { class: "btn primary", onclick: () => {
    const f = readForm(body);
    if (!f.name.trim() || !f.target) { toast("Name and target are needed"); return; }
    if (isNew) { const ng = { id: uid(), name: f.name.trim(), target: f.target, saved: f.saved || 0, monthly: 0, due: "", created: today(), log: [], milestones: {} }; S.goals.push(ng); save(); closeModal(); refresh(); negotiate(ng); return; }
    Object.assign(g, { name: f.name.trim(), target: f.target, saved: f.saved || 0 });
    save(); checkGoalRewards(g); closeModal(); refresh();
  } }, isNew ? "Next: plan it" : "Save"));
  modal(isNew ? "New goal" : "Edit goal", body, actions);
}

function rewardCard(c) {
  const r = S.settings.rewards;
  const list = r.list || [];
  const canMoney = r.mode !== "list" && c.amount > 0;
  const canList = r.mode !== "money" && list.length > 0;
  return card(`🎁 Reward unlocked · ${c.goal} hit ${c.pct}%`, "accent-pink tertiary",
    h("p", { class: "small" }, canMoney ? `Take ${fmt0(c.amount)} of fun money (capped so it never eats the goal)` : "", canMoney && canList ? " — or —" : "", !canMoney && !canList ? "Set up rewards in More → Rewards to make milestones pay out." : ""),
    h("div", { class: "row" },
      canMoney ? h("button", { class: "btn lime grow", onclick: () => { claimMoney(c); celebrate("🎉", fmt0(c.amount) + " fun money", "Spend it on whatever. It's yours.", refresh); } }, `Take ${fmt0(c.amount)}`) : null,
      ...(canList ? list.map((it) => h("button", { class: "btn grow", onclick: () => { claimListItem(c, it); celebrate("🎁", it.name, "Enjoy it. You earned it.", refresh); } }, it.name)) : []),
      h("button", { class: "btn ghost sm", onclick: () => { const copy = c; S.game.claimable = S.game.claimable.filter((x) => x.id !== c.id); save(); refresh(); toastUndo("Reward skipped", () => { S.game.claimable.push(copy); save(); refresh(); }); } }, "Skip")));
}

function showFunLog() {
  modal("Fun money history", h("ul", { class: "list" }, ...S.game.funLog.slice().reverse().map((l) => h("li", null, h("div", { class: "main" }, h("div", { class: "title" }, l.note), h("div", { class: "meta" }, l.date)), h("div", { class: "amt " + (l.amt > 0 ? "lime" : "") }, l.amt ? fmt(l.amt, { plus: true }) : "")))), [h("button", { class: "btn ghost", onclick: closeModal }, "Close")]);
}
