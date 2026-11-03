// Loans: what a car loan (or any financed thing) really costs, and what paying extra saves.
import { S, save, uid, today, monthLabel } from "../state.js";
import { fmt0 } from "../money.js";
import { h, section, emptyState, field, input, numInput, readForm, modal, closeModal, toast, toastUndo, confirmBox } from "./common.js";
import { schedule, compare, extraForMonths, paymentForTerm, applyPayment, monthInterest } from "../loan.js";
import { addXP, XP, award, touch, markQuest, checkQuests } from "../game.js";
import { txHash } from "../csv.js";
import { refresh } from "../router.js";

const open = new Set();

export function render(root) {
  if (!S.loans.length) root.append(section("Loans", { accent: "violet" }, emptyState({ ico: "↯", title: "Nothing financed yet", why: "The car, a credit card balance, a phone plan — anything with interest. The slider shows what paying a little extra saves.", action: { label: "Add a loan", cls: "primary", onclick: () => openLoanForm() } })));
  root.append(...S.loans.map(loanCard));
  if (S.loans.length) root.append(h("button", { class: "btn primary block", onclick: () => openLoanForm() }, "+ Add loan"));
  if (S.loans.length) markQuest("viewedLoan"), checkQuests();
}

function loanCard(l) {
  const maxExtra = Math.max(100, Math.ceil((Number(l.minPayment) || 100) * 2 / 10) * 10);
  const el = h("section", { class: "card primary accent-violet", "aria-label": l.name });
  // Built once; the slider stays in the DOM. `update()` re-renders only what depends on the extra amount
  // (label, comparison boxes, savings line, table), so a drag is never interrupted by a rebuild.
  const label = h("h3", { class: "mt", id: "extra-" + l.id }, "");
  const range = h("input", { type: "range", min: 0, max: maxExtra, step: 5, value: Number(l.extra) || 0, "aria-labelledby": "extra-" + l.id });
  const dyn = h("div", null);
  const update = () => {
    const c2 = compare(l); const b2 = c2.base, w2 = c2.withExtra;
    const extra = Number(l.extra) || 0;
    label.textContent = `Extra per month: ${fmt0(extra)}`;
    dyn.innerHTML = "";
    dyn.append(...[
      h("div", { class: "loan-compare" },
        h("div", { class: "box" }, h("h4", null, "Minimum only"), h("div", { class: "v" }, b2.neverPays ? "never" : `${b2.months} mo`), h("div", { class: "small muted" }, b2.neverPays ? "" : "done " + monthLabel(b2.payoffDate.slice(0, 7), true)), h("div", { class: "small" }, "interest ", h("b", { class: "danger" }, b2.neverPays ? "∞" : fmt0(b2.totalInterest)))),
        h("div", { class: "box with" }, h("h4", null, `With +${fmt0(extra)}`), h("div", { class: "v" }, w2.neverPays ? "never" : `${w2.months} mo`), h("div", { class: "small muted" }, w2.neverPays ? "" : "done " + monthLabel(w2.payoffDate.slice(0, 7), true)), h("div", { class: "small" }, "interest ", h("b", { class: "lime" }, w2.neverPays ? "∞" : fmt0(w2.totalInterest))))),
      c2.interestSaved > 0 ? h("div", { class: "saved-line lime" }, `Saves ${fmt0(c2.interestSaved)} and ${c2.monthsSaved} month${c2.monthsSaved === 1 ? "" : "s"}`) : h("div", { class: "saved-line muted" }, "Slide to see what extra does"),
      h("p", { class: "tiny dim" }, `Total you'd pay: ${b2.neverPays ? "—" : fmt0(b2.totalPaid)} minimum-only vs ${w2.neverPays ? "—" : fmt0(w2.totalPaid)} with extra. Assumes the extra goes to principal; tell the lender that when you pay.`),
      h("div", { class: "row mt" },
        h("button", { class: "btn cyan grow", onclick: () => byDate(l) }, "Pay off by…"),
        h("button", { class: "btn lime grow", onclick: () => logPayment(l) }, "Log a payment"),
        h("button", { class: "btn ghost", onclick: () => { open.has(l.id) ? open.delete(l.id) : open.add(l.id); update(); } }, open.has(l.id) ? "Hide table" : "Table")),
      open.has(l.id) ? scheduleTable(w2) : null,
    ].filter(Boolean));
  };
  range.addEventListener("input", () => { l.extra = Number(range.value); update(); });          // live while dragging
  range.addEventListener("change", () => { save(); if (l.extra > 0) award("loanExtra"); update(); }); // pointer released
  const b0 = compare(l).base;
  el.append(...[
    h("div", { class: "card-head" }, h("h2", { style: { margin: 0 } }, l.name), h("button", { class: "btn sm ghost", "aria-label": "Edit " + l.name, onclick: () => openLoanForm(l) }, "Edit")),
    h("div", { class: "row between small muted" }, h("span", null, `${fmt0(l.balance)} left · ${l.apr}% APR`), h("span", null, `min ${fmt0(l.minPayment)}/mo`)),
    b0.neverPays ? h("div", { class: "negotiate" }, h("div", { class: "verdict no" }, "The minimum payment doesn't even cover the interest. The balance grows. Extra is not optional here.")) : null,
    label, range, dyn,
  ].filter(Boolean));
  update();
  return el;
}

function scheduleTable(s) {
  const rows = s.schedule;
  const step = rows.length > 36 ? Math.ceil(rows.length / 24) : 1;
  const show = rows.filter((r, i) => i % step === 0 || i === rows.length - 1);
  return h("div", { class: "scroll-x mt" }, h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", null, "Month"), h("th", null, "Interest"), h("th", null, "Principal"), h("th", null, "Balance"))),
    h("tbody", null, ...show.map((r) => h("tr", null, h("td", null, r.date.slice(0, 7)), h("td", { class: "danger" }, fmt0(r.interest)), h("td", null, fmt0(r.principal)), h("td", null, fmt0(r.balance)))))));
}

function byDate(l) {
  const base = schedule(l.balance, l.apr, l.minPayment, 0);
  let months = 24, extra = null;
  const label = h("label", null, "");
  const range = h("input", { type: "range", min: 1, max: Math.min(360, base.neverPays ? 120 : Math.max(2, base.months)), value: months, "aria-label": "Months to pay off" });
  const res = h("div", null);
  const useBtn = h("button", { class: "btn primary", onclick: () => { l.extra = extra; save(); if (extra > 0) award("loanExtra"); closeModal(); refresh(); } }, "Use this extra");
  const update = () => {
    extra = extraForMonths(l, months);
    const s = extra == null ? null : schedule(l.balance, l.apr, l.minPayment, extra);
    label.textContent = `Done in ${months} months`;
    res.innerHTML = "";
    res.append(s ? h("div", null, h("p", null, "Needs ", h("b", { class: "cyan" }, fmt0(extra)), " extra a month (", h("b", null, fmt0((Number(l.minPayment) || 0) + extra)), " total)."), h("p", { class: "small muted" }, `Interest ${fmt0(s.totalInterest)} instead of ${base.neverPays ? "∞" : fmt0(base.totalInterest)} — saves ${base.neverPays ? "a lot" : fmt0(base.totalInterest - s.totalInterest)}.`)) : h("p", { class: "danger" }, "Not reachable."));
    useBtn.disabled = extra == null;
  };
  range.addEventListener("input", () => { months = Number(range.value); update(); }); // slider node never replaced
  range.addEventListener("change", update);
  const body = h("div", null,
    h("div", { class: "field" }, label, range),
    res,
    h("div", { class: "actions" }, h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"), useBtn));
  update();
  modal("Pay off " + l.name + " by…", body);
}

function logPayment(l) {
  const total = (Number(l.minPayment) || 0) + (Number(l.extra) || 0);
  const body = h("div", null,
    h("div", { class: "field-row" }, field("Amount paid", numInput("amount", total)), field("Date", input("date", today(), { type: "date" }))),
    h("p", { class: "small muted" }, "Interest for the month is estimated at " + fmt0(monthInterest(l.balance, l.apr)) + "; the rest comes off the balance. Correct the balance in Edit whenever your statement shows a different number."));
  modal("Log payment: " + l.name, body, [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"), h("button", { class: "btn lime", onclick: () => {
    const f = readForm(body);
    if (!f.amount || f.amount <= 0) { toast("Enter an amount"); return; }
    const date = f.date || today();
    const amt = Math.round(f.amount * 100) / 100;
    const r = applyPayment(l.balance, l.apr, amt);
    l.balance = r.balance;
    l.log = l.log || []; l.log.push({ date, amt, interest: r.interest });
    const desc = l.name + " payment";
    S.tx.push({ id: uid(), date, desc, amount: -amt, cat: "loans", src: "manual", hash: txHash(date, desc, -amt), logged: today(), loanId: l.id });
    save(); touch();
    addXP(f.amount > (Number(l.minPayment) || 0) + 0.5 ? XP.loanExtra : XP.log, "loan payment");
    if (f.amount > (Number(l.minPayment) || 0) + 0.5) award("loanExtra");
    checkQuests(); closeModal(); refresh();
  } }, "Log")]);
}

export function openLoanForm(l) {
  const isNew = !l || !l.id;
  const v = { name: "", balance: null, apr: null, minPayment: null, term: "", ...(l || {}) };
  const balIn = numInput("balance", v.balance), aprIn = numInput("apr", v.apr, { placeholder: "e.g. 7.9" }), payIn = numInput("minPayment", v.minPayment), termIn = numInput("term", v.term, { step: "1", placeholder: "months left" });
  termIn.addEventListener("input", () => { if (termIn.value && balIn.value && aprIn.value && !payIn.value) payIn.placeholder = Math.round(paymentForTerm(Number(balIn.value), Number(aprIn.value), Number(termIn.value)) * 100) / 100; });
  const body = h("div", null,
    field("Name", input("name", v.name, { placeholder: "Car, credit card, couch…" })),
    h("div", { class: "field-row" }, field("Balance now", balIn), field("APR %", aprIn)),
    h("div", { class: "field-row" }, field("Monthly payment", payIn, "the required one"), field("Months left (optional)", termIn, "fills the payment if you don't know it")));
  const actions = [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel")];
  if (!isNew) actions.push(h("button", { class: "btn danger", onclick: () => confirmBox(`Delete the loan "${l.name}" (${fmt0(l.balance)} left)? Payments already logged stay in your transactions; the balance, APR and extra-payment plan go.`, () => {
    const idx = S.loans.indexOf(l);
    S.loans = S.loans.filter((x) => x.id !== l.id); save(); closeModal(); refresh();
    toastUndo(`Deleted ${l.name}`, () => { S.loans.splice(Math.min(idx, S.loans.length), 0, l); save(); refresh(); });
  }, "Delete", { title: "Delete loan", undoable: true }) }, "Delete"));
  actions.push(h("button", { class: "btn primary", onclick: () => {
    const f = readForm(body);
    if (!f.name.trim() || !f.balance || f.apr == null) { toast("Name, balance and APR are needed"); return; }
    let pay = f.minPayment;
    if (!pay && f.term) pay = Math.round(paymentForTerm(f.balance, f.apr, f.term) * 100) / 100;
    if (!pay) { toast("Enter the monthly payment or months left"); return; }
    const rec = { name: f.name.trim(), balance: f.balance, apr: f.apr, minPayment: pay, term: f.term || "" };
    if (isNew) S.loans.push({ id: uid(), extra: 0, log: [], ...rec }); else Object.assign(l, rec);
    save(); closeModal(); refresh();
  } }, isNew ? "Add" : "Save"));
  modal(isNew ? "New loan" : "Edit loan", body, actions);
}
