// Small DOM helpers shared by every view: element builder, cards/sections, empty states, bottom-sheet modal,
// toasts (plain and with Undo), celebrate overlay (queued), form reading.
import { S, catColor, catName } from "../state.js";

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k in el && k !== "list" && k !== "form") { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

// Plain card (kept for the modules that call it). Secondary level unless cls says otherwise.
export function card(title, cls, ...body) {
  return h("section", { class: "card " + (cls || "") }, title ? h("h3", null, title) : null, ...body);
}

// The standard card with a level. opts: { level: "primary"|"secondary"|"tertiary", accent: "pink"|"cyan"|"lime"|
// "amber"|"violet"|"danger", cls, action: { label, onclick, cls }, id }
let sectionSeq = 0;
export function section(title, opts, ...children) {
  const o = opts || {};
  const cls = ["card", o.level && o.level !== "secondary" ? o.level : "", o.accent ? "accent-" + o.accent : "", o.cls || ""].filter(Boolean).join(" ");
  const id = o.id || "sec" + (++sectionSeq);
  const el = h("section", { class: cls, "aria-labelledby": title ? id + "-t" : null });
  if (title) {
    const t = h("h3", { id: id + "-t" }, title);
    el.append(o.action ? h("div", { class: "card-head" }, t, h("button", { class: "btn sm " + (o.action.cls || "ghost"), onclick: o.action.onclick }, o.action.label)) : t);
  }
  el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
  return el;
}

// Empty state: WHAT (title) / WHY (why) / NEXT ACTION (action). All optional except title.
export function emptyState({ ico, title, why, action, cls } = {}) {
  return h("div", { class: "empty " + (cls || ""), role: "note" },
    ico ? h("div", { class: "ico", "aria-hidden": "true" }, ico) : null,
    title ? h("div", { class: "t" }, title) : null,
    why ? h("p", { class: "why" }, why) : null,
    action ? h("button", { class: "btn sm " + (action.cls || ""), onclick: action.onclick }, action.label) : null);
}
export function empty(text) { return emptyState({ title: text }); }

let toastTimer;
function showToast(nodes, cls, ms) {
  const t = document.getElementById("toast");
  t.innerHTML = ""; t.append(...nodes); t.className = "toast " + cls;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), ms);
}
export function toast(msg, cls = "") { showToast([h("span", { class: "msg" }, msg)], cls, 2600); }
// Toast with a 5-second Undo. undoFn runs at most once; the toast closes when it does.
export function toastUndo(msg, undoFn, cls = "") {
  let done = false;
  const b = h("button", { class: "undo", type: "button", onclick: () => { if (done) return; done = true; document.getElementById("toast").classList.add("hidden"); clearTimeout(toastTimer); undoFn(); } }, "Undo");
  showToast([h("span", { class: "msg" }, msg), b], cls, 5000);
}

export function closeModal() { const m = document.getElementById("modal"); m.classList.add("hidden"); m.innerHTML = ""; }
export function modal(title, body, actions = []) {
  const m = document.getElementById("modal");
  m.innerHTML = "";
  const sheet = h("div", { class: "sheet" }, title ? h("h2", null, title) : null, body);
  if (actions.length) sheet.append(h("div", { class: "actions" }, ...actions));
  m.append(sheet);
  m.setAttribute("aria-label", title);
  m.classList.remove("hidden");
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  return sheet;
}

// Destructive confirm. Say exactly what goes and whether it can be undone.
// opts: { title, undoable: false } — when not undoable, the text is followed by "This can't be undone."
export function confirmBox(text, onYes, yesLabel = "Yes", opts = {}) {
  const note = opts.undoable ? "You get a few seconds to undo afterwards." : "This can't be undone.";
  modal(opts.title || "Are you sure?", h("div", null, h("p", null, text), h("p", { class: "small muted" }, note)), [
    h("button", { class: "btn ghost", onclick: closeModal }, "Cancel"),
    h("button", { class: "btn danger", onclick: () => { closeModal(); onYes(); } }, yesLabel),
  ]);
}

// Form field builders
export function field(label, input, hint) {
  return h("div", { class: "field" }, h("label", null, label), input, hint ? h("div", { class: "hint" }, hint) : null);
}
export function input(name, value, attrs = {}) { return h("input", { name, value: value ?? "", ...attrs }); }
export function numInput(name, value, attrs = {}) { return h("input", { name, type: "number", inputmode: "decimal", step: "0.01", value: value ?? "", ...attrs }); }
export function select(name, options, value) {
  return h("select", { name }, ...options.map((o) => h("option", { value: o.value, selected: o.value === value }, o.label)));
}
export function catSelect(name, value) {
  return select(name, S.categories.map((c) => ({ value: c.id, label: c.name })), value || "other");
}
export function readForm(root) {
  const o = {};
  root.querySelectorAll("[name]").forEach((el) => {
    if (el.type === "checkbox") o[el.name] = el.checked;
    else if (el.type === "number" || el.type === "range") o[el.name] = el.value === "" ? null : Number(el.value);
    else o[el.name] = el.value;
  });
  return o;
}

export function catDot(id) { return h("span", { class: "cat-dot", style: { color: catColor(id) }, "aria-hidden": "true" }); }
export function catPill(id) { return h("span", { class: "pill", style: { color: catColor(id), borderColor: catColor(id) } }, catName(id)); }

export function bar(frac, cls = "", label) {
  const f = Math.max(0, Math.min(1, frac || 0));
  return h("div", { class: "bar " + cls + (frac > 1 ? " over" : ""), role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(f * 100), "aria-label": label || null }, h("i", { style: { width: Math.round(f * 100) + "%" } }));
}

// Status pill: text always, colour by status key (ok / warn / danger / info / plain).
export function statusPill(text, status) { return h("span", { class: "pill " + (status || "") }, text); }

// Celebrate overlay: one at a time (queued), tap anywhere to dismiss.
const queue = [];
let showing = false;
export function celebrate(ico, title, text, onClose) {
  queue.push({ ico, title, text, onClose });
  if (!showing) nextCelebrate();
}
function nextCelebrate() {
  const c = queue.shift();
  if (!c) { showing = false; return; }
  showing = true;
  let closed = false;
  const close = () => { if (closed) return; closed = true; box.remove(); c.onClose?.(); setTimeout(nextCelebrate, 150); };
  const box = h("div", { class: "celebrate", role: "dialog", "aria-modal": "true", "aria-label": c.title, onclick: close }, h("div", { class: "box" },
    h("div", { class: "big", "aria-hidden": "true" }, c.ico), h("h2", null, c.title), h("p", null, c.text),
    h("button", { class: "btn primary block", onclick: close }, "Nice"),
    h("p", { class: "hint" }, "Tap anywhere to close")));
  document.body.append(box);
  box.querySelector("button").focus({ preventScroll: true });
}

export function dateLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function dateLabelY(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T12:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
