// Income: deposits this month, the figure the app plans against (typed or from deposits), upcoming paydays,
// a six-month deposits chart, and the list of income transactions.
import { S, save, thisMonth, addMonths, monthLabel, today, toISO, daysBetween } from "../state.js";
import { fmt, fmt0 } from "../money.js";
import { h, section, emptyState, bar, dateLabel, field, input, modal, closeModal, toast, readForm } from "./common.js";
import { totalIncome, incomeTx, months, depositIncome, currentIncome } from "../analysis.js";
import { incomeFreq } from "../budget.js";
import { askIncome } from "./intro.js";
import { openTxForm } from "./txform.js";
import { refresh } from "../router.js";

export function render(root) {
  const cur = thisMonth();
  const got = totalIncome(cur);
  const plan = currentIncome();
  const dep = depositIncome();
  const mode = S.settings.incomeMode === "deposits" ? "deposits" : "manual";
  const freq = incomeFreq(S.settings.incomeFreq);

  // 1. this month
  root.append(section("Income this month", { level: "primary", accent: "lime" },
    h("div", { class: "stat" }, h("div", { class: "value lime num" }, fmt0(got)),
      h("div", { class: "sub" }, plan > 0 ? `${fmt0(plan)} expected · ${got >= plan ? "all in" : fmt0(plan - got) + " still to come"}` : "no planning figure yet")),
    plan > 0 ? bar(Math.min(1, got / plan), "lime thin") : null,
    h("div", { class: "row mt" }, h("button", { class: "btn lime grow", onclick: () => openTxForm({ amount: 0.01, cat: "income", desc: "" }, { income: true }) }, "+ Log a deposit"))));

  // 2. planning figure
  root.append(section("What the app plans against", {},
    h("div", { class: "kv" }, h("span", { class: "k muted" }, "Monthly figure"), h("span", { class: "v num" }, fmt0(plan))),
    h("div", { class: "kv" }, h("span", { class: "k muted" }, "Source"), h("span", { class: "v" }, mode === "deposits" ? (S.settings.income > 0 ? "expected · deposits tracked against it" : `deposits (${dep.basis})`) : `typed · ${freq.label.toLowerCase()}${S.settings.incomeEntered && freq.id !== "monthly" ? " " + fmt0(S.settings.incomeEntered) : ""}`)),
    h("p", { class: "tiny muted" }, mode === "deposits" ? (S.settings.income > 0 ? `Deposits are averaging ${fmt0(dep.monthly)} a month (${dep.basis}). Clear the expected figure to plan against that average instead.` : "Averages the last three full months that had deposits. Log, import or capture a paycheck and this moves on its own.") : "Free cash, goals and the weekly allowances are measured against this. Switch to \"From my deposits\" to let paychecks set it."),
    h("button", { class: "btn sm cyan", onclick: () => askIncome(refresh) }, "Change")));

  // 3. paydays
  root.append(paydays(plan, freq));

  // 4. six-month chart
  const ms = months(6);
  const vals = ms.map((m) => totalIncome(m));
  const max = Math.max(1, ...vals);
  root.append(section("Six months of deposits", {},
    vals.some((v) => v > 0) ? h("div", { class: "mchart" }, ...ms.map((m, i) => h("button", { class: "col" + (m === cur ? " cur" : ""), type: "button", "aria-label": `${monthLabel(m, true)}: ${fmt0(vals[i])}`, title: fmt0(vals[i]) }, h("i", { style: { height: Math.round(vals[i] / max * 85) + "%" } }), h("span", null, monthLabel(m)))))
      : emptyState({ ico: "$", title: "No deposits logged yet", why: "Paychecks filed as Income build this chart and can set the planning figure automatically.", action: { label: "Log a deposit", onclick: () => openTxForm({ amount: 0.01, cat: "income", desc: "" }, { income: true }) } })));

  // 5. list
  const list = incomeTx().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  root.append(section("Deposits", {},
    list.length ? h("ul", { class: "list" }, ...list.map((t) => h("li", { class: "tap", role: "button", tabindex: 0, onclick: () => openTxForm(t) },
      h("div", { class: "main" }, h("div", { class: "title" }, t.desc), h("div", { class: "meta" }, dateLabel(t.date) + (t.src === "csv" ? " · import" : t.src === "notif" ? " · captured" : ""))),
      h("div", { class: "amt lime" }, fmt(t.amount, { plus: true })))))
      : emptyState({ ico: "◉", title: "Nothing here yet", why: "Anything filed under Income lands here: paychecks, refunds, money someone sent you.", action: { label: "Log a deposit", onclick: () => openTxForm({ amount: 0.01, cat: "income", desc: "" }, { income: true }) } })));
}

// Expected paydays this month and the next, from the frequency and an anchor date (last payday).
function paydays(plan, freq) {
  const anchor = S.settings.payAnchor;
  const per = freq.id === "weekly" ? 7 : freq.id === "biweekly" ? 14 : 0;
  const perCheck = freq.id === "monthly" ? plan : S.settings.incomeEntered || (per ? plan * 12 / (per === 7 ? 52 : 26) : plan);
  const rows = [];
  if (per) {
    if (!anchor) return section("Paydays", {}, h("p", { class: "small muted" }, `Paid ${freq.label.toLowerCase()}. Tell the app the last payday and it will list the next ones.`), h("button", { class: "btn sm", onclick: setAnchor }, "Set last payday"));
    let d = new Date(anchor + "T12:00");
    const t = new Date(today() + "T12:00");
    while (d < t) d.setDate(d.getDate() + per);
    for (let i = 0; i < 4; i++) { rows.push({ date: toISO(d), amt: perCheck }); d.setDate(d.getDate() + per); }
  } else {
    const day = Number(S.settings.payday) || 1;
    for (let i = 0; i < 2; i++) { const mk = addMonths(thisMonth(), i); const [y, m] = mk.split("-").map(Number); const dim = new Date(y, m, 0).getDate(); const ds = `${mk}-${String(Math.min(day, dim)).padStart(2, "0")}`; if (ds >= today()) rows.push({ date: ds, amt: perCheck }); }
  }
  const next = rows[0];
  return section("Paydays", { action: per ? { label: "Change", onclick: setAnchor } : null },
    next ? h("div", { class: "kv" }, h("span", { class: "k" }, h("b", null, "Next"), " ", h("span", { class: "muted" }, `in ${daysBetween(today(), next.date)} day${daysBetween(today(), next.date) === 1 ? "" : "s"}`)), h("span", { class: "v num" }, `${dateLabel(next.date)} · ${fmt0(next.amt)}`)) : null,
    ...rows.slice(1).map((r) => h("div", { class: "kv tiny muted" }, h("span", { class: "k" }, dateLabel(r.date)), h("span", { class: "v num" }, fmt0(r.amt)))),
    !rows.length ? h("p", { class: "small muted" }, "Set a payday under More → Income & basics.") : null);
}

function setAnchor() {
  const body = h("div", null, field("Last payday", input("anchor", S.settings.payAnchor || today(), { type: "date" }), "The app counts forward from this date at your pay frequency."));
  modal("Last payday", body, [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"), h("button", { class: "btn primary", onclick: () => { const f = readForm(body); if (!f.anchor) { toast("Pick a date"); return; } S.settings.payAnchor = f.anchor; save(); closeModal(); refresh(); } }, "Save")]);
}
