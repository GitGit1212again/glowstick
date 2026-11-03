// Spend: month picker, category breakdown, six-month trend, patterns, the transaction list, notification inbox.
import { S, save, thisMonth, addMonths, monthLabel, catName, catColor } from "../state.js";
import { fmt, fmt0 } from "../money.js";
import { h, section, bar, emptyState, catDot, dateLabel, toast, toastUndo, confirmBox } from "./common.js";
import { totalSpend, totalIncome, byCategory, months, weekdayPattern, topMerchants, titleCase, avgCategory } from "../analysis.js";
import { openTxForm } from "./txform.js";
import { refresh, go } from "../router.js";
import { txHash } from "../csv.js";
import { capFor } from "../budget.js";
import { addXP, XP, touch, checkQuests } from "../game.js";

let month = thisMonth();
let filterCat = null;
let mode = "list"; // list | patterns | inbox

export function render(root) {
  const spend = totalSpend(month), inc = totalIncome(month);
  const cats = byCategory(month);
  const total = spend || 1;

  root.append(h("div", { class: "month-nav" },
    h("button", { class: "btn sm icon", "aria-label": "Previous month", onclick: () => { month = addMonths(month, -1); filterCat = null; refresh(); } }, "‹"),
    h("h2", { "aria-live": "polite" }, monthLabel(month, true)),
    h("button", { class: "btn sm icon", "aria-label": "Next month", disabled: month >= thisMonth(), onclick: () => { month = addMonths(month, 1); filterCat = null; refresh(); } }, "›")));

  root.append(h("div", { class: "grid2 mb" },
    h("div", { class: "card stat", style: { marginBottom: 0 } }, h("div", { class: "label" }, "Spent"), h("div", { class: "value" }, fmt0(spend))),
    h("div", { class: "card stat ok", style: { marginBottom: 0 } }, h("div", { class: "label" }, "Received"), h("div", { class: "value" }, fmt0(inc)))));

  // trend
  const ms = months(6);
  const vals = ms.map((m) => totalSpend(m));
  const max = Math.max(1, ...vals);
  root.append(section("Six months", {}, h("div", { class: "mchart", role: "group", "aria-label": "Spending by month" }, ...ms.map((m, i) => h("button", { class: "col" + (m === month ? " cur" : ""), type: "button", onclick: () => { month = m; filterCat = null; refresh(); }, title: fmt0(vals[i]), "aria-label": `${monthLabel(m, true)}: ${fmt0(vals[i])}`, "aria-pressed": m === month ? "true" : "false" }, h("i", { style: { height: Math.round(vals[i] / max * 85) + "%" } }), h("span", null, monthLabel(m)))))));

  // categories
  root.append(section("By category", {}, cats.length ? h("div", { class: "catbars" }, ...cats.map(([c, v]) => {
    const cap = c === "income" || c === "savings" ? 0 : capFor(c);
    const avg = avgCategory(c);
    const row = h("div", { class: "catrow" + (filterCat === c ? " active" : ""), role: "button", tabindex: 0, "aria-pressed": filterCat === c ? "true" : "false", onclick: () => { filterCat = filterCat === c ? null : c; mode = "list"; refresh(); }, onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.currentTarget.click(); } } },
      h("div", { class: "name" }, catDot(c), catName(c), cap ? h("span", { class: "pill " + (v > cap ? "danger" : "cyan") }, (v > cap ? "over cap " : "cap ") + fmt0(cap)) : null),
      h("div", { class: "amt" }, fmt0(v), h("span", { class: "tiny muted" }, avg ? ` · avg ${fmt0(avg)}` : "")),
      cap ? bar(v / cap, "thin", catName(c) + " against cap") : h("div", { class: "bar thin" }, h("i", { style: { width: Math.round(v / total * 100) + "%", background: catColor(c), boxShadow: `0 0 8px ${catColor(c)}` } })));
    return row;
  })) : emptyState({ ico: "▤", title: `Nothing in ${monthLabel(month, true)}`, why: "Category bars appear once a transaction lands in this month.", action: { label: "Add a transaction", onclick: () => openTxForm({ date: month === thisMonth() ? undefined : month + "-01" }) } })));

  // mode switch
  const seg = h("div", { class: "seg mb", role: "tablist", "aria-label": "Spend view" },
    h("button", { class: mode === "list" ? "active" : "", role: "tab", "aria-selected": mode === "list" ? "true" : "false", onclick: () => { mode = "list"; refresh(); } }, "Transactions"),
    h("button", { class: mode === "patterns" ? "active" : "", role: "tab", "aria-selected": mode === "patterns" ? "true" : "false", onclick: () => { mode = "patterns"; refresh(); } }, "Patterns"),
    h("button", { class: mode === "inbox" ? "active" : "", role: "tab", "aria-selected": mode === "inbox" ? "true" : "false", onclick: () => { mode = "inbox"; refresh(); } }, `Inbox${S.pending.length ? " (" + S.pending.length + ")" : ""}`));
  root.append(seg);

  if (mode === "list") renderList(root);
  else if (mode === "patterns") renderPatterns(root);
  else renderInbox(root);

  root.append(h("button", { class: "fab", "aria-label": "Add transaction", title: "Add transaction", onclick: () => openTxForm({ date: month === thisMonth() ? undefined : month + "-01" }) }, "+"));
}

function renderList(root) {
  const list = S.tx.filter((t) => t.date.slice(0, 7) === month && (!filterCat || t.cat === filterCat)).sort((a, b) => b.date.localeCompare(a.date) || (b.id > a.id ? 1 : -1));
  root.append(section(filterCat ? `${catName(filterCat)} · ${list.length}` : `Transactions · ${list.length}`, filterCat ? { action: { label: "✕ Clear filter", onclick: () => { filterCat = null; refresh(); } } } : {},
    list.length ? h("ul", { class: "list", "aria-label": "Transactions" }, ...list.map((t) => h("li", { class: "tap", role: "button", tabindex: 0, onclick: () => openTxForm(t), onkeydown: (e) => { if (e.key === "Enter") openTxForm(t); } },
      catDot(t.cat),
      h("div", { class: "main" }, h("div", { class: "title" }, t.desc), h("div", { class: "meta" }, `${dateLabel(t.date)} · ${catName(t.cat)}${t.src === "csv" ? " · import" : t.src === "notif" ? " · captured" : t.src === "bill" ? " · bill" : ""}${t.fun ? " · fun money" : ""}`)),
      h("div", { class: "amt " + (t.amount > 0 ? "lime" : "") }, fmt(t.amount, { plus: true })))))
      : filterCat ? emptyState({ ico: "▤", title: `No ${catName(filterCat)} this month`, why: "Nothing was filed under this category in " + monthLabel(month, true) + ".", action: { label: "Show everything", onclick: () => { filterCat = null; refresh(); } } })
      : emptyState({ ico: "▤", title: "No transactions yet", why: "Type one in, import the bank's CSV, or let notifications fill this in for you.", action: { label: "Import a CSV", onclick: () => go("more") } })));
}

function renderPatterns(root) {
  const wk = weekdayPattern(3);
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const max = Math.max(1, ...wk.totals);
  const any = wk.counts.reduce((a, b) => a + b, 0) > 0;
  root.append(section("Which days cost the most (last 3 months)", {}, any ? [h("div", { class: "wkchart", role: "img", "aria-label": names.map((n, i) => `${n} ${fmt0(wk.totals[i])}`).join(", ") }, ...names.map((n, i) => h("div", { class: "col", title: fmt0(wk.totals[i]) }, h("i", { style: { height: Math.round(wk.totals[i] / max * 90) + "%" } }), h("span", null, n)))),
    h("p", { class: "tiny muted mt" }, `Busiest day: ${names[wk.totals.indexOf(max)]} at ${fmt0(max)} total.`)]
    : emptyState({ ico: "◷", title: "No pattern yet", why: "Weekday patterns need a few weeks of transactions to mean anything.", action: { label: "Add a transaction", onclick: () => openTxForm() } })));
  const tm = topMerchants(month, 8);
  root.append(section("Top places this month", {}, tm.length ? h("ul", { class: "list" }, ...tm.map((m) => h("li", null, catDot(m.cat), h("div", { class: "main" }, h("div", { class: "title" }, titleCase(m.name)), h("div", { class: "meta" }, `${m.count} time${m.count === 1 ? "" : "s"} · ${catName(m.cat)}`)), h("div", { class: "amt" }, fmt0(m.total))))) : emptyState({ ico: "◉", title: "No places yet", why: "Merchants are grouped from transaction names. Imports and captures fill this in fastest.", action: { label: "Import a CSV", onclick: () => go("more") } })));
  const ms = months(6);
  const rows = S.categories.filter((c) => !["income", "savings"].includes(c.id)).map((c) => ({ c, vals: ms.map((m) => byCategory(m).find((x) => x[0] === c.id)?.[1] || 0) })).filter((r) => r.vals.some((v) => v > 0));
  root.append(section("Category by month", {}, rows.length ? h("div", { class: "scroll-x" }, h("table", { class: "tbl" }, h("thead", null, h("tr", null, h("th", { scope: "col" }, "Category"), ...ms.map((m) => h("th", { scope: "col" }, monthLabel(m))))), h("tbody", null, ...rows.map((r) => h("tr", null, h("td", null, r.c.name), ...r.vals.map((v) => h("td", { class: v ? "" : "dim" }, v ? fmt0(v) : "·"))))))) : emptyState({ ico: "▤", title: "Nothing to compare yet", why: "This table fills in month by month as spending is logged." })));
}

function renderInbox(root) {
  const notifOn = S.settings.sources.notif;
  const discardOne = (p) => {
    const idx = S.pending.findIndex((x) => x.id === p.id);
    S.pending = S.pending.filter((x) => x.id !== p.id); save(); refresh();
    toastUndo(`Discarded "${p.desc}"`, () => { S.pending.splice(Math.min(idx, S.pending.length), 0, p); save(); refresh(); });
  };
  root.append(section("Captured from notifications", { accent: "pink" },
    S.pending.length ? h("ul", { class: "list", "aria-label": "Captured purchases" }, ...S.pending.map((p) => h("li", null,
      catDot(p.cat), h("div", { class: "main tap", role: "button", tabindex: 0, onclick: () => openTxForm(p, { fromPending: true }), onkeydown: (e) => { if (e.key === "Enter") openTxForm(p, { fromPending: true }); } }, h("div", { class: "title" }, p.desc), h("div", { class: "meta" }, `${dateLabel(p.date)} · ${p.app || p.pkg} · tap to confirm`), h("div", { class: "tiny dim" }, p.raw)),
      h("div", { class: "amt" }, fmt(p.amount)),
      h("button", { class: "btn sm ghost icon", title: "Not a transaction", "aria-label": "Discard " + p.desc, onclick: () => discardOne(p) }, "✕"))))
      : emptyState({ ico: "◉", title: notifOn ? "Inbox is clear" : "Notification capture is off", why: notifOn ? "New bank or Wallet notifications land here for a one-tap confirm." : "Turn it on and purchases get filed for you as the notifications come in.", action: notifOn ? null : { label: "Open Sources", onclick: () => go("more") } }),
    S.pending.length ? h("div", { class: "row mt" }, h("button", { class: "btn sm lime", onclick: acceptAll }, "Accept all as guessed"), h("button", { class: "btn sm ghost", onclick: () => confirmBox(`Discard all ${S.pending.length} captured purchase${S.pending.length === 1 ? "" : "s"} in the inbox? They will not be added to your transactions.`, () => { const kept = S.pending; S.pending = []; save(); refresh(); toastUndo(`Discarded ${kept.length}`, () => { S.pending = kept.concat(S.pending); save(); refresh(); }); }, "Discard all", { undoable: true }) }, "Discard all")) : null));
}

function acceptAll() {
  let n = 0;
  for (const p of S.pending) {
    S.tx.push({ id: p.id, date: p.date, desc: p.desc, amount: p.amount, cat: p.cat, src: "notif", notifId: p.notifId, hash: txHash(p.date, p.desc, p.amount), logged: p.date });
    n++;
  }
  S.pending = [];
  save(); touch(); addXP(XP.review * n, "reviewed captures"); checkQuests(); refresh();
  toast(`${n} added`, "xp");
}
