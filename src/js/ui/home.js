// Home, in reading order: (1) the one number that matters — free this month; (2) what is owed soon;
// (3) spending, including the weekly allowances and the hold button; (4) goals; (5) today's behaviour (quests,
// streak, XP); (6) the reward layer — coupons and what the numbers say.
import { replaceState } from "../state.js";
import { canLoadDemo, demoState } from "../demo.js";
import { confirmBox } from "./common.js";
import { S, thisMonth, addMonths, catName, toISO } from "../state.js";
import { fmt0 } from "../money.js";
import { h, section, bar, emptyState, toast, catDot, dateLabel, statusPill } from "./common.js";
import { totalSpend, suggestions, freeCash, byCategory } from "../analysis.js";
import { upcoming, markPaid } from "../bills.js";
import { progress, remaining, isDone } from "../goal.js";
import { todaysQuests, levelInfo } from "../game.js";
import { walletCard } from "./coupons.js";
import { openTxForm } from "./txform.js";
import { go, refresh } from "../router.js";
import { impulseCard, stopTimer } from "./impulse.js";

export function render(root) {
  if (S.settings.demo) root.append(h("div", { class: "card", role: "status" }, h("b", null, "Fictional demo finances"), h("p", { class: "small muted" }, "Explore the savings goal and CSV workflow. These are examples, not your money."), h("button", { class: "btn", onclick: () => go("more") }, "Start fresh in Backup & reset")));
  else if (canLoadDemo(S)) root.append(h("div", { class: "card" }, h("b", null, "See how Glowstick works"), h("p", { class: "small muted" }, "Try fictional spending, bills and an emergency-fund goal. Available only before you enter finances."), h("button", { class: "btn cyan", onclick: () => confirmBox("Load fictional demo finances? Use Backup & reset > Erase all when you are ready to start your own records.", () => { if (!canLoadDemo(S)) { toast("Demo needs an empty app"); return; } if (!replaceState(demoState())) { toast("Demo could not be saved"); return; } refresh(); }, "Try demo") }, "Try a clean demo")));
  const cur = thisMonth(), prev = addMonths(cur, -1);
  root.append(availableMoney());
  root.append(obligations());
  root.append(spending(cur, prev));
  root.append(goals());
  root.append(behaviour());
  root.append(...rewards());
  root.append(h("button", { class: "fab", "aria-label": "Add transaction", title: "Add transaction", onclick: () => openTxForm() }, "+"));
}

export function unmount() { stopTimer(); }

// (1) AVAILABLE MONEY — one primary card, status colour by sign.
function availableMoney() {
  const fc = freeCash();
  if (!fc.income) {
    return section("Free this month", { level: "primary", accent: "cyan", cls: "hero" },
      emptyState({ ico: "◉", title: "No income set yet", why: "Free money is income minus bills, loan minimums and everyday spending. It needs the first number.", action: { label: "Set income", cls: "cyan", onclick: () => go("more") } }));
  }
  const neg = fc.free < 0;
  const tight = !neg && fc.free < fc.income * 0.1;
  const tone = neg ? "danger" : tight ? "warn" : "ok";
  return section("Free this month", { level: "primary", accent: neg ? "danger" : tight ? "amber" : "lime", cls: "hero" },
    h("div", { class: "stat big " + tone }, h("div", { class: "value" }, (neg ? "−" : "") + fmt0(Math.abs(fc.free)))),
    h("div", { class: "breakdown", "aria-label": "How that is worked out" },
      h("span", null, h("b", null, fmt0(fc.income)), " in", fc.extra > 0 ? h("span", { class: "muted" }, ` (${fmt0(fc.plan)} expected + ${fmt0(fc.extra)} over)`) : null),
      h("span", null, h("span", { class: "op" }, "− "), h("b", null, fmt0(fc.fixed)), " bills & loans"),
      h("span", null, h("span", { class: "op" }, "− "), h("b", null, fmt0(fc.habits)), " everyday")),
    h("p", { class: "small muted", style: { margin: "6px 0 0" } }, neg ? "Spending is ahead of income this month. Bills and loans are still counted in full." : tight ? "Tight. Every everyday purchase now comes out of this." : "What is left after everything that has to happen. Goals draw from here."));
}

// (2) OBLIGATIONS — bills due in 7 days (overdue first) and loan minimums not yet logged this month.
function obligations() {
  const up = upcoming(7);
  const cur = thisMonth();
  const loansDue = S.loans.filter((l) => Number(l.minPayment) > 0 && !(l.log || []).some((e) => (e.date || "").slice(0, 7) === cur));
  const overdue = up.filter((x) => x.s.key === "overdue").length;
  const title = overdue ? `Due soon · ${overdue} overdue` : "Due in the next 7 days";
  if (!S.bills.length && !S.loans.length) {
    return section("Due soon", { accent: "amber" }, emptyState({ ico: "◷", title: "No bills or loans listed", why: "Anything listed here is taken out of Free this month before you see it, so the number stays honest.", action: { label: "Add a bill", onclick: () => go("bills") } }));
  }
  const rows = up.map(({ b, s }) => h("li", null,
    catDot(b.cat || "utilities"),
    h("div", { class: "main" }, h("div", { class: "title" }, b.name), h("div", { class: "meta" }, statusPill(s.label, s.key === "overdue" ? "danger" : "warn"))),
    h("div", { class: "amt" }, fmt0(b.amount)),
    h("button", { class: "btn sm lime", "aria-label": "Mark " + b.name + " paid", onclick: () => { markPaid(b); toast("Paid: " + b.name, "xp"); refresh(); } }, "Paid")));
  const loanRows = loansDue.map((l) => h("li", null,
    catDot("loans"),
    h("div", { class: "main" }, h("div", { class: "title" }, l.name), h("div", { class: "meta" }, statusPill("Minimum this month", "info"))),
    h("div", { class: "amt" }, fmt0(l.minPayment)),
    h("button", { class: "btn sm ghost", "aria-label": "Log a payment on " + l.name, onclick: () => go("loans") }, "Log")));
  return section(title, { accent: overdue ? "danger" : "amber", action: { label: "All bills", onclick: () => go("bills") } },
    rows.length || loanRows.length ? h("ul", { class: "list", "aria-label": "Due soon" }, ...rows, ...loanRows) : h("p", { class: "small muted", style: { margin: 0 } }, "Nothing due this week."));
}

// (3) SPENDING — this month vs last, top 3 categories, then the weekly allowances + hold button.
function spending(cur, prev) {
  const spend = totalSpend(cur), last = totalSpend(prev);
  const cats = byCategory(cur).slice(0, 3);
  const top = Math.max(1, ...cats.map(([, v]) => v));
  const diff = spend - last;
  const body = spend || cats.length ? [
    h("div", { class: "cmp" }, h("span", { class: "now num" }, fmt0(spend)), h("span", { class: "vs" }, last ? `${diff <= 0 ? "▼" : "▲"} ${fmt0(Math.abs(diff))} vs last month (${fmt0(last)})` : "spent this month · no last month yet")),
    ...cats.map(([c, v]) => h("div", { class: "kv-bar", style: { marginBottom: "6px" } },
      h("div", { class: "kv" }, h("span", { class: "k" }, catDot(c), catName(c)), h("span", { class: "v" }, fmt0(v))),
      bar(v / top, "thin", catName(c)))),
    h("button", { class: "btn sm ghost block", style: { marginTop: "8px" }, onclick: () => go("spend") }, "Full breakdown"),
  ] : [emptyState({ ico: "▤", title: "Nothing logged this month", why: "Spending shows up here from what you type in, import from the bank, or capture from notifications.", action: { label: "Add a transaction", onclick: () => openTxForm() } })];
  const pending = S.pending.length ? h("button", { class: "btn sm block", style: { marginTop: "8px" }, onclick: () => go("spend") }, `${S.pending.length} captured purchase${S.pending.length === 1 ? "" : "s"} to confirm`) : null;
  const sec = section("Spending", { accent: "violet" }, ...body, pending);
  const wrap = h("div", null, sec, impulseCard());
  return wrap;
}

// (4) GOALS — progress bars.
function goals() {
  const live = S.goals.filter((g) => !isDone(g));
  if (!live.length) return section("Goals", { accent: "cyan" }, emptyState({ ico: "◆", title: S.goals.length ? "All goals done" : "No goal yet", why: S.goals.length ? "Everything you set out to save for is saved. Pick the next thing." : "A goal turns Free this month into a finish date, and milestones pay out fun money.", action: { label: S.goals.length ? "New goal" : "Make a goal", onclick: () => go("goals") } }));
  return section("Goals", { accent: "cyan", action: { label: "Open", onclick: () => go("goals") } }, ...live.map((g) => h("div", { style: { marginBottom: "10px" } },
    h("div", { class: "kv" }, h("b", { class: "k" }, g.name), h("span", { class: "v num" }, `${fmt0(g.saved || 0)} / ${fmt0(g.target)}`)),
    bar(progress(g), "lime", g.name),
    h("div", { class: "tiny muted" }, `${fmt0(remaining(g))} to go · ${fmt0(g.monthly || 0)} a month · target ${g.due || "—"}`))));
}

// (5) BEHAVIOUR — quests, streak, XP to next level, yesterday's restraint result.
function behaviour() {
  const qs = todaysQuests();
  const li = levelInfo();
  return section(`Today's quests · Level ${li.level} ${li.name}`, { level: "tertiary", accent: "lime" },
    h("div", { role: "list" }, ...qs.map((q) => h("div", { class: "quest" + (q.done ? " done" : ""), role: "listitem" }, h("div", { class: "ico", "aria-hidden": "true" }, q.done ? "✓" : q.ico), h("div", { class: "body" }, h("b", null, q.done ? h("span", { class: "sr-only" }, "Done: ") : null, q.title), h("span", null, q.body + (q.restraint ? " · counts at the end of the day" : ""))), h("div", { class: "xpv" }, "+15 xp")))),
    yesterday(),
    h("div", { class: "row between small muted", style: { marginTop: "8px" } }, h("span", null, `${li.xp} xp · ${li.next > li.xp ? li.next - li.xp + " to next level" : "max level"}`), S.game.streak > 1 ? h("span", { class: "amber" }, `🔥 ${S.game.streak}-day streak`) : h("span", { class: "dim" }, "use it tomorrow to start a streak")));
}

// (6) REWARD LAYER — claimable rewards, coupon wallet, suggestions.
function rewards() {
  const out = [];
  if (S.game.claimable.length) out.push(h("button", { class: "btn primary block mb", onclick: () => go("goals") }, `🎁 ${S.game.claimable.length} reward${S.game.claimable.length > 1 ? "s" : ""} to claim`));
  const wc = walletCard(); if (wc) { wc.classList.add("tertiary"); out.push(wc); }
  const sg = suggestions().slice(0, 4);
  out.push(section("What the numbers say", { accent: "cyan" }, sg.length ? sg.map((s) => h("div", { class: "sugg" }, h("div", { class: "ico cyan", "aria-hidden": "true" }, s.ico), h("div", { class: "body" }, h("b", null, s.title), h("span", null, s.body)))) : emptyState({ ico: "◈", title: S.tx.length < 10 ? "Not enough data yet" : "Nothing stands out", why: S.tx.length < 10 ? "Suggestions start once there are a couple of weeks of transactions to compare." : "Spending looks like your usual. Check back after a few more days.", action: S.tx.length < 10 ? { label: "Import a CSV", onclick: () => go("more") } : null })));
  return out;
}

// What yesterday's restraint quest came to, so the credit for NOT doing something is visible.
function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  const ds = toISO(d);
  const rec = S.game.quests[ds];
  if (!rec || !rec.scored) return null;
  const won = Object.keys(rec).some((k) => k !== "scored" && k !== "viewedLoan" && rec[k] === true && ["noTakeout", "noGaming", "slice", "noSpend", "underWeek"].includes(k));
  return h("div", { class: "tiny " + (won ? "lime" : "dim"), style: { marginTop: "6px" } }, won ? "✓ Yesterday's restraint quest: done, +15 xp" : "Yesterday's restraint quest: not this time");
}
