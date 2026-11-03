// Bills: list with status, add/edit, mark paid, suggestions from recurring charges.
import { S, save, uid, today, thisMonth, addMonths, monthLabel } from "../state.js";
import { fmt0 } from "../money.js";
import { h, section, emptyState, field, input, numInput, catSelect, readForm, modal, closeModal, toast, toastUndo, confirmBox, catDot, dateLabelY, statusPill } from "./common.js";
import { status, markPaid, unmarkPaid, nextDue } from "../bills.js";
import { detectRecurring } from "../analysis.js";
import { refresh, go } from "../router.js";

const TONE = { overdue: "danger", soon: "warn", paid: "ok", later: "" };

export function render(root) {
  const rows = S.bills.map((b) => ({ b, s: status(b) })).sort((a, c) => a.s.days - c.s.days);
  const total = S.bills.reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const paidThis = S.bills.filter((b) => (b.paid || {})[thisMonth()]).reduce((a, b) => a + (Number(b.amount) || 0), 0);
  const overdue = rows.filter((r) => r.s.key === "overdue").length;

  root.append(h("div", { class: "grid2 mb" },
    h("div", { class: "card stat", style: { marginBottom: 0 } }, h("div", { class: "label" }, "Bills per month"), h("div", { class: "value" }, fmt0(total))),
    h("div", { class: "card stat ok", style: { marginBottom: 0 } }, h("div", { class: "label" }, "Paid this month"), h("div", { class: "value" }, fmt0(paidThis)), h("div", { class: "sub" }, `${fmt0(total - paidThis)} still to go`))));

  root.append(section(overdue ? `Bills · ${overdue} overdue` : "Bills", { level: "primary", accent: overdue ? "danger" : "amber", action: S.bills.length ? { label: "+ Add", onclick: () => openBillForm() } : null },
    rows.length ? h("ul", { class: "list", "aria-label": "Bills" }, ...rows.map(({ b, s }) => h("li", null,
      catDot(b.cat || "utilities"),
      h("div", { class: "main tap", role: "button", tabindex: 0, "aria-label": "Edit " + b.name, onclick: () => openBillForm(b), onkeydown: (e) => { if (e.key === "Enter") openBillForm(b); } },
        h("div", { class: "title" }, b.name, b.autopay ? h("span", { class: "pill cyan", style: { marginLeft: "6px" } }, "autopay") : null),
        h("div", { class: "meta" }, statusPill(s.key === "paid" ? "Paid" : s.label, TONE[s.key]), h("span", { class: "dim" }, ` · day ${b.day}`))),
      h("div", { class: "amt" }, fmt0(b.amount)),
      s.key === "paid" ? h("button", { class: "btn sm ghost icon", title: "Undo paid", "aria-label": "Undo paid for " + b.name, onclick: () => { unmarkPaid(b, thisMonth()); refresh(); toast("Unmarked: " + b.name); } }, "↶")
        : h("button", { class: "btn sm lime", "aria-label": "Mark " + b.name + " paid", onclick: () => payDialog(b) }, "Paid"))))
      : emptyState({ ico: "◷", title: "No bills yet", why: "Rent, phone, insurance, subscriptions — anything that comes round every month. Listed bills come off Free this month automatically.", action: { label: "Add a bill", cls: "primary", onclick: () => openBillForm() } })));

  // paid history per month
  if (S.bills.length) {
    const ms = [thisMonth(), addMonths(thisMonth(), -1), addMonths(thisMonth(), -2)];
    root.append(section("Last three months", {}, h("div", { class: "scroll-x" }, h("table", { class: "tbl" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, "Bill"), ...ms.map((m) => h("th", { scope: "col" }, monthLabel(m))))),
      h("tbody", null, ...S.bills.map((b) => h("tr", null, h("td", null, b.name), ...ms.map((m) => h("td", { class: (b.paid || {})[m] ? "lime" : "dim", "aria-label": (b.paid || {})[m] ? "paid" : "not paid" }, (b.paid || {})[m] ? "✓" : "·")))))))));
  }

  // recurring not yet bills
  const rec = detectRecurring().filter((r) => !r.known);
  if (rec.length) root.append(section("Looks recurring — add as bills?", { accent: "cyan" }, h("ul", { class: "list" }, ...rec.slice(0, 6).map((r) => h("li", null,
    h("div", { class: "main" }, h("div", { class: "title" }, r.name), h("div", { class: "meta" }, `${r.period} · seen ${r.count}× · last ${dateLabelY(r.last)}`)),
    h("div", { class: "amt" }, fmt0(r.amount)),
    h("button", { class: "btn sm", "aria-label": "Add " + r.name + " as a bill", onclick: () => openBillForm({ name: r.name, amount: Math.round(r.amount * 100) / 100, day: Number(r.next.slice(8, 10)), cat: r.cat, match: r.key }) }, "Add"))))));
  else if (!S.bills.length && S.tx.length < 5) root.append(section("Recurring charges", {}, emptyState({ ico: "↻", title: "Nothing recurring spotted", why: "Once a few months of transactions are in, charges that repeat show up here with an Add button.", action: { label: "Import a CSV", onclick: () => go("more") } })));
}

function payDialog(b) {
  const body = h("div", null,
    h("div", { class: "field-row" }, field("Amount", numInput("amount", b.amount)), field("Paid on", input("date", today(), { type: "date" }))),
    h("p", { class: "small muted" }, "This logs a transaction in " + (b.cat || "utilities") + " and ticks the bill for " + monthLabel(nextDue(b).month, true) + "."));
  modal("Mark paid: " + b.name, body, [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"), h("button", { class: "btn lime", onclick: () => { const f = readForm(body); markPaid(b, { amount: f.amount, date: f.date }); closeModal(); toast("Paid: " + b.name, "xp"); refresh(); } }, "Paid")]);
}

export function openBillForm(b) {
  const isNew = !b || !b.id;
  const v = { name: "", amount: null, day: 1, cat: "utilities", autopay: false, match: "", ...(b || {}) };
  const body = h("div", null,
    field("Name", input("name", v.name, { placeholder: "Rent, T-Mobile, car insurance…" })),
    h("div", { class: "field-row" }, field("Amount per month", numInput("amount", v.amount)), field("Due day of month", numInput("day", v.day, { step: "1", min: "1", max: "31" }))),
    field("Category", catSelect("cat", v.cat)),
    field("Match text in imports", input("match", v.match, { placeholder: "optional, e.g. 'tmobile'" }), "When a CSV import contains this text with a similar amount, the bill is ticked automatically."),
    h("label", { class: "check" }, h("input", { type: "checkbox", name: "autopay", checked: v.autopay }), h("span", null, "Paid automatically (autopay)")));
  const actions = [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel")];
  if (!isNew) actions.push(h("button", { class: "btn danger", onclick: () => confirmBox(`Delete the bill "${b.name}" (${fmt0(b.amount)} a month)? Payments already logged stay in your transactions.`, () => {
    const idx = S.bills.findIndex((x) => x.id === b.id), copy = S.bills[idx];
    S.bills = S.bills.filter((x) => x.id !== b.id); save(); closeModal(); refresh();
    toastUndo(`Deleted ${b.name}`, () => { S.bills.splice(Math.min(idx, S.bills.length), 0, copy); save(); refresh(); });
  }, "Delete", { title: "Delete bill", undoable: true }) }, "Delete"));
  actions.push(h("button", { class: "btn primary", onclick: () => {
    const f = readForm(body);
    if (!f.name.trim() || !f.amount) { toast("Name and amount are needed"); return; }
    const rec = { name: f.name.trim(), amount: f.amount, day: Math.min(31, Math.max(1, Math.round(f.day || 1))), cat: f.cat, autopay: f.autopay, match: (f.match || "").trim().toLowerCase() };
    if (isNew) S.bills.push({ id: uid(), paid: {}, ...rec }); else Object.assign(S.bills.find((x) => x.id === b.id), rec);
    save(); closeModal(); refresh();
  } }, isNew ? "Add" : "Save"));
  modal(isNew ? "New bill" : "Edit bill", body, actions);
}
