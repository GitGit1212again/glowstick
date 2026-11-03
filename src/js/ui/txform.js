// Add / edit one transaction. Used by Home (quick add), Spend (edit) and the notification inbox (confirm).
import { S, save, uid, today } from "../state.js";
import { h, modal, closeModal, field, input, numInput, catSelect, readForm, toast, toastUndo, confirmBox } from "./common.js";
import { guessCategory, merchantKey, addRule, applyRulesTo } from "../categorize.js";
import { txHash } from "../csv.js";
import { XP, award, awardOnce, touch, checkQuests, spendFun, noteSorted } from "../game.js";
import { round2, fmt } from "../money.js";
import { refresh } from "../router.js";

export function openTxForm(tx, opts = {}) {
  const isNew = !tx || !tx.id || opts.fromPending;
  const t = { date: today(), desc: "", amount: null, cat: "other", ...(tx || {}) };
  const amountAbs = t.amount == null || opts.income ? "" : Math.abs(t.amount);
  const kind = t.amount > 0 || opts.income ? "in" : "out";

  const seg = h("div", { class: "seg" },
    h("button", { type: "button", class: kind === "out" ? "active" : "", "data-k": "out" }, "Spent"),
    h("button", { type: "button", class: kind === "in" ? "active" : "", "data-k": "in" }, "Received"));
  seg.querySelectorAll("button").forEach((b) => b.onclick = () => { seg.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b)); });

  const descIn = input("desc", t.desc, { placeholder: "Where / what", autocomplete: "off" });
  const catSel = catSelect("cat", t.cat);
  descIn.addEventListener("input", () => { if (isNew) catSel.value = guessCategory(descIn.value, seg.querySelector(".active").dataset.k === "in" ? 1 : -1); });
  const alwaysBox = h("label", { class: "check" }, h("input", { type: "checkbox", name: "always" }), h("span", null, "Always file ", h("b", { id: "mk" }, merchantKey(t.desc) || "this"), " here"));
  descIn.addEventListener("input", () => { alwaysBox.querySelector("#mk").textContent = merchantKey(descIn.value) || "this"; });
  const funBox = S.game.funMoney > 0 ? h("label", { class: "check" }, h("input", { type: "checkbox", name: "fun", checked: !!t.fun }), h("span", null, `Pay from fun money (${fmt(S.game.funMoney)} available)`)) : null;

  const body = h("div", null,
    seg,
    h("div", { class: "field-row", style: { marginTop: ".8rem" } },
      field("Amount", numInput("amount", amountAbs, { placeholder: "0.00", min: "0", required: true })),
      field("Date", input("date", t.date, { type: "date" }))),
    field("Description", descIn),
    field("Category", catSel),
    alwaysBox, funBox,
    t.raw ? h("p", { class: "tiny dim" }, "From notification: " + t.raw) : null);

  const actions = [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel")];
  if (!isNew) actions.push(h("button", { class: "btn danger", onclick: () => confirmBox(`Delete "${t.desc || "this transaction"}" (${fmt(t.amount)})?`, () => {
    const idx = S.tx.findIndex((x) => x.id === t.id), copy = S.tx[idx];
    S.tx = S.tx.filter((x) => x.id !== t.id); save(); closeModal(); refresh();
    toastUndo("Deleted", () => { S.tx.splice(Math.min(idx < 0 ? S.tx.length : idx, S.tx.length), 0, copy); save(); refresh(); });
  }, "Delete", { title: "Delete transaction", undoable: true }) }, "Delete"));
  actions.push(h("button", { class: "btn primary", onclick: submit }, isNew ? "Add" : "Save"));
  const sheet = modal(isNew ? (opts.fromPending ? "Confirm capture" : "Add transaction") : "Edit transaction", body, actions);
  setTimeout(() => (isNew && !t.desc ? body.querySelector("[name=amount]") : descIn).focus(), 50);

  function submit() {
    const f = readForm(body);
    if (f.amount == null || f.amount <= 0) { toast("Enter an amount"); return; }
    if (!f.date) { toast("Pick a date"); return; }
    const sign = seg.querySelector(".active").dataset.k === "in" ? 1 : -1;
    const amount = sign * round2(Math.abs(f.amount));
    if (!(amount !== 0) || Math.abs(amount) > 1e9) { toast("That amount doesn't look right"); return; }
    const desc = (f.desc || "").trim() || "(no description)";
    if (f.always) addRule(merchantKey(desc) || desc.toLowerCase(), f.cat);
    if (isNew) {
      const rec = { id: uid(), date: f.date, desc, amount, cat: f.cat, src: opts.fromPending ? "notif" : "manual", hash: txHash(f.date, desc, amount), logged: today() };
      if (t.notifId) rec.notifId = t.notifId;
      if (f.fun && amount < 0) { rec.fun = true; spendFun(Math.min(-amount, S.game.funMoney), desc); }
      S.tx.push(rec);
      if (opts.fromPending) S.pending = S.pending.filter((p) => p.id !== t.id);
      save();
      touch();
      // same transaction (date|desc|amount) deleted and re-added today earns once
      awardOnce("log:" + rec.hash + ":" + today(), XP.log, amount < 0 ? "logged what you spent — the numbers stay true" : "logged money in — the picture stays whole");
      award("first");
    } else {
      const rec = S.tx.find((x) => x.id === t.id);
      const catChanged = rec.cat !== f.cat;
      Object.assign(rec, { date: f.date, desc, amount, cat: f.cat, hash: txHash(f.date, desc, amount) });
      save();
      if (catChanged) { noteSorted(); touch(); awardOnce("sort:" + rec.id + ":" + today(), XP.categorize, "sorted a transaction — patterns show up sooner"); }
    }
    if (f.always) { const n = applyRulesTo(S.tx); if (n) toast(`Rule saved: ${n} other transaction${n === 1 ? "" : "s"} refiled`); save(); }
    checkQuests();
    closeModal();
    refresh();
    opts.onDone?.();
  }
}
