// Coupon UI: the draw window (pick a category, a random card flips over, a mascot picture watches),
// the wallet card on Home (pick a card, Redeem), and the deck editor in More → Rewards.
import { S, save } from "../state.js";
import { h, card, modal, closeModal, toast, confirmBox, field, input, dateLabel, readForm, numInput } from "./common.js";
import * as C from "../coupons.js";
import { allImages, stickSVG } from "./mascot.js";
import { refresh } from "../router.js";

let picked = null;

// ---- Home: draws available + wallet
export function walletCard() {
  const p = C.progress();
  const w = C.wallet();
  const n = S.settings.notify || {};
  const who = n.name, tell = !!(who && n.phone);
  if (!p.available && !w.length && !p.have) return null;
  const groups = [...new Map(w.map((e) => [e.cardId, w.filter((x) => x.cardId === e.cardId)])).values()];
  const chosen = w.find((e) => e.id === picked);
  return card(p.available ? `🎟 ${p.available} draw${p.available === 1 ? "" : "s"} waiting` : "Coupons", "accent-pink",
    p.available ? h("button", { class: "btn primary block", onclick: openDraw }, `Draw a card (${p.available} left)`) : h("p", { class: "tiny muted" }, `${p.have} of ${p.need} towards the next draw`),
    ...C.cats().flatMap((k) => { const gs = groups.filter((l) => l[0].cat === k.id); return gs.length ? [h("h4", { class: "tiny", style: { color: k.color, margin: ".6rem 0 .1rem", textTransform: "uppercase", letterSpacing: ".08em" } }, k.name), ...gs.map((l) => ticket(l, k))] : []; }),
    w.length ? h("p", { class: "tiny muted", style: { marginTop: ".4rem" } }, "Tap a card to pick it, then redeem." + (tell ? ` ${who} gets a text.` : "")) : null,
    w.length ? h("button", { class: "btn lime block mt", disabled: !chosen, onclick: () => { if (!chosen) { toast("Tap a card first"); return; } if (chosen.wild) { wishForm(chosen, who, tell); return; } confirmBox(`Redeem "${chosen.title}"?` + (tell ? ` This texts ${who}.` : ""), () => { const ok = C.redeem(chosen); picked = null; toast(ok ? "Redeemed. Enjoy it." : "That one was already redeemed"); refresh(); }, "Redeem"); } }, chosen ? `Redeem "${chosen.title}"` : "Redeem a card") : null);
}
function ticket(list, k) {
  const e = list[0];
  return h("div", { class: "ticket" + (picked === e.id ? " picked" : "") + (e.wild ? " wild" : ""), style: picked === e.id ? null : { borderColor: e.wild ? "#ffd54a" : k.color }, onclick: () => { picked = picked === e.id ? null : e.id; refresh(); } },
    h("div", { class: "tk-main" }, h("b", null, e.wild ? "★ " : "", e.title, list.length > 1 ? h("span", { class: "pill lime", style: { marginLeft: ".4rem" } }, "×" + list.length) : null), h("div", { class: "small muted" }, e.note || ""), h("div", { class: "tiny dim" }, "drawn " + dateLabel(e.earned))),
    h("span", { class: "tk-pick" }, picked === e.id ? "●" : "○"));
}

// ---- The draw window
export function openDraw() {
  const p = C.progress();
  if (!p.available) { toast("No draws yet"); return; }
  const imgs = allImages();
  const pic = imgs.length ? imgs[Math.floor(Math.random() * imgs.length)] : null;
  const dealable = C.dealableCats();
  const body = h("div", { class: "draw" },
    pic ? h("img", { class: "draw-pic", src: pic.data, alt: "" }) : h("div", { class: "draw-pic", style: { display: "flex", justifyContent: "center" }, html: stickSVG("happy", "#ff2fd2", 110) }),
    dealable.length ? null : h("p", { class: "small amber center" }, "No cards are in the deck yet. Add some under More → Rewards, then draw."),
    h("p", { class: "small muted center" }, `${p.available} draw${p.available === 1 ? "" : "s"}. Pick a category — the card is random.`),
    h("div", { class: "draw-cats" }, ...C.cats().map((k) => { const n = C.cardsIn(k.id).length; return h("button", { class: "btn block", style: { borderColor: k.color, color: k.color }, disabled: !n, onclick: () => flip(k) }, k.name, h("span", { class: "tiny dim" }, ` · ${n} card${n === 1 ? "" : "s"}`)); })),
    h("div", { class: "draw-stage" }));
  const sheet = modal("Draw a card", body, [h("button", { class: "btn ghost", onclick: () => { closeModal(); refresh(); } }, "Close")]);
  function flip(k) {
    const stage = body.querySelector(".draw-stage");
    stage.innerHTML = "";
    body.querySelector(".draw-cats").classList.add("hidden");
    const back = h("div", { class: "playcard back", style: { borderColor: k.color } }, h("div", { class: "pc-face" }, "?"));
    stage.append(back);
    setTimeout(() => {
      const e = C.deal(k.id);
      if (!e) { toast("Nothing to deal from " + k.name); stage.innerHTML = ""; body.querySelector(".draw-cats").classList.remove("hidden"); return; }
      back.classList.add("flip");
      setTimeout(() => {
        back.classList.remove("back"); back.classList.add("front");
        back.innerHTML = "";
        back.append(h("div", { class: "pc-cat", style: { color: k.color } }, k.name), h("div", { class: "pc-title" }, e.title), h("div", { class: "pc-note" }, e.note || ""));
        const left = C.progress().available;
        const actions = sheet.querySelector(".actions");
        actions.innerHTML = "";
        actions.append(...[h("button", { class: "btn ghost", onclick: () => { closeModal(); refresh(); } }, "Keep it"), left ? h("button", { class: "btn primary", onclick: () => { closeModal(); openDraw(); } }, `Draw again (${left})`) : null].filter(Boolean));
      }, 350);
    }, 700);
  }
}

// ---- More → Rewards: deck editor
export function deckEditor() {
  const el = h("div", { class: "mt" });
  const draw = () => {
    el.innerHTML = "";
    const p = C.progress();
    el.append(...[h("h3", null, "Coupon deck"),
      h("p", { class: "small muted" }, "Good habits earn draws. He picks a category, the card is random, and it waits in the wallet on Home until redeemed. Write the cards however you like; several lines of fine print = a different line each time that card comes up."),
      h("div", { class: "row between small" }, h("span", null, `Draws waiting: ${p.available} · progress ${p.have}/${p.need} · ${p.earned} earned so far`), h("button", { class: "btn sm ghost", onclick: () => { C.giveDraw(1); toast("Bonus draw given"); draw(); } }, "+ Bonus draw")),
      field("Difficulty ramp", h("select", { onchange: (e) => { C.setRamp(e.target.value); draw(); } }, ...[["none", "Flat: every trigger is a draw"], ["gentle", "Gentle: 1, then 2, then 3 triggers (max 3)"], ["steady", "Steady: 1, 2, 3, 4, 5 (max 5)"], ["steep", "Steep: 1, 3, 5, 7 (max 8)"]].map(([v, l]) => h("option", { value: v, selected: (S.settings.coupons2?.ramp || "gentle") === v }, l))), "The first draw comes on the first trigger; each later draw needs more, up to the ceiling."),
      h("details", null, h("summary", { class: "small muted" }, `What counts as a trigger (${C.triggersOn().length} on)`),
        ...Object.entries(C.TRIGGERS).map(([id, t]) => h("label", { class: "check", style: { minHeight: "36px" } }, h("input", { type: "checkbox", checked: C.triggersOn().includes(id), onchange: (e) => C.setTrigger(id, e.target.checked) }), h("span", { class: "small" }, t.name)))),
      h("details", null, h("summary", { class: "small muted" }, "Categories: " + C.cats().map((c) => c.name).join(" · ")),
        ...C.cats().map((c) => h("div", { class: "row", style: { padding: ".2rem 0" } },
          h("input", { type: "color", value: c.color, style: { width: "36px", height: "32px", border: 0, background: "none" }, onchange: (e) => { c.color = e.target.value; save(); draw(); } }),
          h("input", { value: c.name, style: { flex: 1, background: "rgba(8,5,18,.8)", border: "1px solid var(--line-strong)", borderRadius: "8px", padding: ".3rem .5rem", minHeight: "36px" }, onchange: (e) => { c.name = e.target.value.trim() || c.name; save(); draw(); } }),
          C.cats().length > 1 ? h("button", { class: "btn sm ghost", onclick: () => { C.removeCat(c.id); draw(); } }, "✕") : null)),
        h("button", { class: "btn sm ghost mt", onclick: () => { C.addCat(); draw(); } }, "+ Category")),
      ...(C.cards().some((c) => c.cat === C.ANY) ? [h("h4", { class: "tiny", style: { color: "#ffd54a", marginTop: ".6rem", textTransform: "uppercase", letterSpacing: ".08em" } }, "Any category · wildcards"), ...C.cards().filter((c) => c.cat === C.ANY).map((c) => h("div", { class: "ticket wild" + (c.enabled === false ? " used" : ""), style: { borderColor: "#ffd54a" } }, h("div", { class: "tk-main" }, h("b", null, "★ " + c.title), h("div", { class: "small muted" }, firstLine(c.note)), h("div", { class: "tiny dim" }, "can come up from any category · he names what he wants when he redeems it")), h("button", { class: "btn sm ghost", onclick: () => cardForm(c, draw) }, "Edit")))] : []),
      ...C.cats().flatMap((k) => { const inCat = C.cards().filter((c) => (c.cat || C.cats()[0].id) === k.id); return [h("h4", { class: "tiny", style: { color: k.color, marginTop: ".6rem", textTransform: "uppercase", letterSpacing: ".08em" } }, `${k.name} · ${inCat.length}`), ...inCat.map((c) => h("div", { class: "ticket" + (c.enabled === false ? " used" : ""), style: { borderColor: k.color } },
        h("div", { class: "tk-main" }, h("b", null, c.title), h("div", { class: "small muted" }, String(c.note || "").split(/\r?\n/)[0])),
        h("button", { class: "btn sm ghost", onclick: () => cardForm(c, draw) }, "Edit")))]; }),
      h("div", { class: "row mt" }, h("button", { class: "btn primary sm", onclick: () => cardForm(null, draw) }, "+ New card"), h("button", { class: "btn ghost sm", onclick: () => confirmBox("Replace the deck with the example cards?", () => { C.resetCards(); draw(); }, "Replace") }, "Load examples")),
      C.redeemed().length ? h("details", { class: "mt" }, h("summary", { class: "small muted" }, `${C.redeemed().length} redeemed`), ...C.redeemed().map((e) => h("div", { class: "tiny dim" }, `${e.redeemed} · ${e.title}`))) : null].filter(Boolean));
  };
  draw();
  return el;
}
function cardForm(c, done) {
  const isNew = !c;
  const v = { title: "", note: "", cat: C.cats()[0].id, enabled: true, ...(c || {}) };
  const body = h("div", null,
    field("Card", input("title", v.title, { placeholder: "Date night" })),
    field("Category", h("select", { name: "cat" }, ...C.cats().map((k) => h("option", { value: k.id, selected: v.cat === k.id }, k.name)), h("option", { value: C.ANY, selected: v.cat === C.ANY }, "Any category (wildcard)")), "A wildcard can be dealt from every category and lets him name any one thing he wants: an action or a gift."),
    field("The fine print", h("textarea", { name: "note", rows: 3, placeholder: "Dinner out, my pick, my treat." }, v.note), "One line per version: each time this card is dealt it says the next line."),
    h("label", { class: "check" }, h("input", { type: "checkbox", name: "enabled", checked: v.enabled !== false }), h("span", null, "In the deck")));
  const actions = [h("button", { class: "btn ghost", onclick: closeModal }, "Cancel")];
  if (!isNew) actions.push(h("button", { class: "btn danger", onclick: () => { C.removeCard(c.id); closeModal(); done(); } }, "Delete"));
  actions.push(h("button", { class: "btn primary", onclick: () => {
    const f = readForm(body);
    if (!f.title.trim()) { toast("Give it a name"); return; }
    const rec = { title: f.title.trim(), note: (f.note || "").trim(), cat: f.cat, enabled: !!f.enabled, wild: f.cat === C.ANY, weight: f.cat === C.ANY ? (c?.weight || 0.35) : undefined };
    if (isNew) C.addCard(rec); else C.updateCard(c.id, rec);
    closeModal(); done();
  } }, isNew ? "Add" : "Save"));
  modal(isNew ? "New card" : "Edit card", body, actions);
}

function firstLine(s) { return String(s || "").split(/\r?\n/)[0]; }

// Wildcard redeem: he names the one thing he wants; that is what gets texted.
function wishForm(e, who, tell) {
  const inp = h("textarea", { name: "wish", rows: 3, placeholder: "An action or a gift. Anything. Be specific." });
  const body = h("div", null, h("p", { class: "small muted" }, "★ Wildcard. Any one thing you want." + (tell ? ` ${who} gets it as a text.` : "")), h("div", { class: "field" }, inp));
  modal("What do you want?", body, [h("button", { class: "btn ghost", onclick: closeModal }, "Not yet"), h("button", { class: "btn lime", onclick: () => {
    const wish = inp.value.trim(); if (!wish) { toast("Say what you want"); return; }
    C.redeem(e, wish); picked = null; closeModal(); toast("Sent. Enjoy it."); refresh();
  } }, "Redeem")]);
  setTimeout(() => inp.focus(), 50);
}
