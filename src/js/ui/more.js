// More: sources (manual / CSV / notifications), CSV import, income, impulse allowances, rewards, caps, rules, badges, data.
import { S, save, uid, replaceState, blank, catName, today, DEFAULT_NOTIFY } from "../state.js";
import { fmt0 } from "../money.js";
import { h, card, field, input, numInput, catSelect, readForm, modal, closeModal, toast, confirmBox, empty, catDot, bar, dateLabelY } from "./common.js";
import { parseCSV, guessMapping, buildTransactions, summarize } from "../csv.js";
import { validateBackup } from "../backup.js";
import { readFileText, exportJSON } from "../storage.js";
import { applyRulesTo } from "../categorize.js";
import { autoMatchBills } from "../bills.js";
import * as notif from "../notif.js";
import { BADGES, TIERS, levelInfo, LEVELS, addXP, XP, award, touch, checkQuests, badgeProgress } from "../game.js";
import { deckEditor } from "./coupons.js";
import { helpSection, incomeInputs, setIncome, setIncomeMode, shouldShowIntro, showIntro } from "./intro.js";
import { sendText, canAutoSend, hasSms, requestSms, smsStatus } from "../notify.js";
import { refresh, go } from "../router.js";
import { buzz } from "../haptics.js";
import { isIOS, canVibrate } from "../platform.js";
import { peek, loadImages, saveImages, addImageFile, recutAll, builtinImages, hideBuiltin, allImages, stickSVG, stateFor, styleFor } from "./mascot.js";
import { KINDS, KIND_NAMES, byKind, unlocked, unlockLabel, equipped, equip } from "../cosmetics.js";
import { PERSONAL } from "../../data/personal.js";
import { PROFILE, APP_VERSION } from "../profile.js";

// Built-in mascot pictures come only from the personal data module; the store build has none.
const MASCOTS = PERSONAL?.mascots || [];
import { DEFAULT_PCT, pctFor, capFor, weeklyFor, totalPct, income } from "../budget.js";

let section = null;
const CURRENCIES = [["$", "$ US dollar"], ["C$", "C$ Canadian dollar"], ["A$", "A$ Australian dollar"], ["MX$", "MX$ Mexican peso"], ["€", "€ Euro"], ["£", "£ British pound"], ["¥", "¥ Yen / yuan"], ["₹", "₹ Indian rupee"], ["₩", "₩ Korean won"], ["₱", "₱ Philippine peso"], ["R$", "R$ Brazilian real"], ["CHF ", "CHF Swiss franc"], ["kr ", "kr Krona / krone"], ["R ", "R South African rand"]];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function render(root) {
  const li = levelInfo();
  root.append(h("div", { class: "card accent-lime" }, h("div", { class: "row between" }, h("div", { class: "stat" }, h("div", { class: "label" }, "Level " + li.level), h("div", { class: "value lime" }, li.name), h("div", { class: "sub" }, `${li.xp} xp · ${li.next > li.xp ? li.next - li.xp + " to " + (LEVELS[li.level] || "") : "max"}`)), h("div", { class: "stat right" }, h("div", { class: "label" }, "Streak"), h("div", { class: "value amber" }, S.game.streak || 0), h("div", { class: "sub" }, "days")))));

  const items = [
    ["sources", "◉", "Where transactions come from", isIOS() ? "manual · CSV import" : "manual · CSV import · notifications"],
    ["import", "⇪", "Import a bank CSV", "export from the bank app, pull it in here"],
    ["money", "$", "Income & basics", canVibrate() ? "monthly take-home, currency, vibration" : "monthly take-home, currency"],
    ["impulse", "⏳", "Impulse allowances", "weekly limits for food, gaming, shopping; hold length"],
    ["rewards", "🎁", "Rewards", "what hitting a milestone gets you"],
    ["mascot", "✿", "Mascot", S.settings.mascot === false ? "off" : `${allImages().length} pictures · shows on level-ups, badges and draws`],
    ["caps", "▤", "Monthly caps", "share of income per category, or fixed dollars"],
    ["rules", "≡", "Filing rules", `${S.rules.length} rule${S.rules.length === 1 ? "" : "s"} for auto-categorising`],
    ["badges", "✦", "Badges", `${Object.keys(S.game.badges).length} of ${Object.keys(BADGES).length} · ${[1, 2, 3].map((t) => TIERS[t].name).join(", ")}`],
    ["data", "⛁", "Backup & reset", "export / import everything"],
    ["help", "?", "Help", "tips for each screen, and the walkthrough again"],
    ["about", "i", "About & privacy", `v${APP_VERSION} · what is stored, where, and what leaves the phone (nothing)`],
  ];
  for (const [id, ico, title, sub] of items) {
    root.append(h("div", { class: "card tap", style: { cursor: "pointer" }, onclick: () => { section = section === id ? null : id; refresh(); } },
      h("div", { class: "row between" }, h("div", { class: "row" }, h("span", { class: "cyan", style: { width: "1.6rem", textAlign: "center", fontSize: "1.2rem" } }, ico), h("div", null, h("b", null, title), h("div", { class: "small muted" }, sub))), h("span", { class: "muted" }, section === id ? "▾" : "▸"))));
    if (section === id) { const s = SECTIONS[id](); s.style.marginTop = "-.5rem"; root.append(s); }
  }
}

const SECTIONS = {
  sources() {
    const src = S.settings.sources;
    const nb = notif.available();
    const acc = nb && notif.hasAccess();
    // Notification capture is Android-only. On an iPhone/iPad there is nothing to switch on, so the option is not shown.
    const showNotif = nb || !isIOS();
    const el = card(null, "",
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: src.manual, onchange: (e) => { src.manual = e.target.checked; save(); } }), h("span", null, h("b", null, "Manual"), h("div", { class: "small muted" }, "The + button. Always there; this switch only hides the button."))),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: src.csv, onchange: (e) => { src.csv = e.target.checked; save(); } }), h("span", null, h("b", null, "CSV import"), h("div", { class: "small muted" }, "Bank app → statements/export → CSV → Import below."))),
      !showNotif ? null : h("label", { class: "check" }, h("input", { type: "checkbox", checked: src.notif, disabled: !nb, onchange: (e) => {
        if (!e.target.checked) { src.notif = false; save(); refresh(); return; }
        if (notif.hasAccess()) { src.notif = true; save(); refresh(); return; }
        e.target.checked = false;
        explainNotifAccess(() => { src.notif = true; save(); refresh(); openNotifAccessAndWatch(); });
      } }), h("span", null, h("b", null, "Bank & Wallet notifications"), h("div", { class: "small muted" }, nb ? (acc ? "Access granted. New 'you spent $X at Y' alerts land in the inbox for a one-tap confirm." : "Needs Notification access. Turn on, then allow Glowstick on the screen that opens.") : "Only in the Android app. Nothing is read in a browser."))),
      nb && src.notif ? h("div", { class: "mt" },
        h("div", { class: "row between" }, h("span", { class: "small muted" }, acc ? "Notification access: granted" : "Notification access: denied"), h("button", { class: "btn sm", onclick: () => { if (acc) notif.openAccess(); else explainNotifAccess(openNotifAccessAndWatch); } }, acc ? "Open settings" : "Grant access")),
        h("h3", { class: "mt" }, "Capture from"),
        h("p", { class: "tiny muted" }, "Tick the apps to listen to. With none ticked, anything that mentions an amount is captured, which is noisier."),
        appPicker(),
        h("button", { class: "btn sm ghost mt", onclick: () => { const n = notif.pull(); toast(n ? n + " captured" : "Nothing new"); refresh(); } }, "Check now")) : null,
      h("p", { class: "tiny dim mt" }, "Nothing leaves the phone in any mode. There is no account and no server."));
    return el;
  },
  import() {
    const el = card(null, "");
    const file = h("input", { type: "file", accept: ".csv,text/csv,text/plain", style: { display: "none" } });
    const pick = h("button", { class: "btn cyan block", onclick: () => file.click() }, "Choose CSV file");
    const out = h("div", { class: "mt" });
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      const text = await readFileText(f);
      const rows = parseCSV(text);
      if (rows.length < 1) { toast("Empty file"); return; }
      const m = guessMapping(rows);
      showMapping(rows, m, out);
    };
    el.append(h("p", { class: "small muted" }, "Most bank apps: Statements or Activity → Export/Download → CSV. The app guesses which columns are date, description and amount; check the preview, then import. Duplicates are skipped, so re-importing an overlapping range is safe."), pick, file, out);
    return el;
  },
  money() {
    const inc = incomeInputs({ label: "Take-home income", hint: "Goals and 'free cash' are measured against the monthly figure. If it varies, use a low one." });
    const body = h("div", null,
      field("Your name", input("uname", S.settings.name || "", { placeholder: "used in the coupon texts" })),
      inc.el,
      h("div", { class: "field-row" }, field("Payday (day of month)", numInput("payday", S.settings.payday, { step: "1", min: "1", max: "31" }), "Always a day of the month, whatever the income frequency."), field("Currency", h("select", { name: "currency", "aria-label": "Currency" }, ...CURRENCIES.map(([sym, label]) => h("option", { value: sym, selected: (S.settings.currency || "$") === sym }, label))))),
      // iOS Safari has no vibration API, so the switch would do nothing there; it is only shown where the call exists.
      canVibrate() ? h("label", { class: "check" }, h("input", { type: "checkbox", checked: S.settings.haptics !== false, onchange: (e) => { S.settings.haptics = e.target.checked; save(); if (e.target.checked) buzz([20, 40, 20]); } }), h("span", null, h("b", null, "Vibration"), h("div", { class: "small muted" }, "Buzzes with the XP bar and on level-ups. Phone only."))) : null,
      );
    return card(null, "", body, h("button", { class: "btn primary", onclick: () => { const f = readForm(body); S.settings.name = (f.uname || "").trim(); const { amount, freq, mode } = inc.read(); if (amount > 0) setIncome(amount, freq, mode); else setIncomeMode(mode); S.settings.payday = f.payday || 1; S.settings.currency = CURRENCIES.some(([sym]) => sym === f.currency) ? f.currency : "$"; save(); toast("Saved"); refresh(); } }, "Save"));
  },
  impulse() {
    const imp = S.settings.impulse;
    const spendCats = S.categories.filter((c) => !["income", "savings", "loans", "housing"].includes(c.id));
    const body = h("div", null,
      h("p", { class: "small muted" }, "Pick the categories that get away from you. The weekly amount comes from the category's share of income (Monthly caps) unless you type your own. The Home screen shows what's left; the 'Want something?' button starts a hold before a buy."),
      field("Week starts on", h("select", { name: "weekStart", onchange: (e) => { imp.weekStart = Number(e.target.value); save(); toast("Week now starts " + DAYS[imp.weekStart]); } }, ...DAYS.map((d, i) => h("option", { value: i, selected: (Number(imp.weekStart) || 0) === i }, d))), "Allowances reset on this day. Payday-aligned often works best."),
      ...spendCats.map((c) => h("div", { class: "row between", style: { padding: ".3rem 0", borderBottom: "1px solid var(--line)" } },
        h("label", { class: "check", style: { minHeight: "36px" } }, h("input", { type: "checkbox", checked: imp.cats.includes(c.id), onchange: (e) => { imp.cats = e.target.checked ? [...new Set([...imp.cats, c.id])] : imp.cats.filter((x) => x !== c.id); save(); } }), h("span", { class: "row" }, catDot(c.id), c.name)),
        h("div", { class: "row" }, h("span", { class: "tiny muted" }, "per week"), h("input", { type: "number", inputmode: "decimal", value: imp.weekly[c.id] ?? "", placeholder: weeklyFor(c.id) ? String(weeklyFor(c.id)) : "—", title: "blank = from the monthly cap", style: { width: "5.5rem", background: "rgba(8,5,18,.8)", border: "1px solid var(--line-strong)", borderRadius: "8px", padding: ".3rem .5rem", minHeight: "36px" }, onchange: (e) => { imp.weekly[c.id] = Number(e.target.value) || 0; save(); } })))),
      field("Hold length (minutes)", numInput("hold", imp.holdMinutes, { step: "1", min: "1", max: "1440" }), "Long enough that the urge fades, short enough that you'll actually wait. 10 to 30 tends to work."));
    body.querySelector("[name=hold]").onchange = (e) => { imp.holdMinutes = Math.max(1, Number(e.target.value) || 15); save(); };
    return card(null, "", body);
  },
  rewards() {
    const r = S.settings.rewards;
    const listEl = h("ul", { class: "list" });
    const drawList = () => { listEl.innerHTML = ""; for (const it of r.list) listEl.append(h("li", null, h("div", { class: "main" }, h("div", { class: "title" }, it.name)), h("button", { class: "btn sm ghost", onclick: () => { r.list = r.list.filter((x) => x.id !== it.id); save(); drawList(); } }, "✕"))); if (!r.list.length) listEl.append(h("li", { class: "muted small" }, "No list rewards yet. Things that aren't money: a takeout night, a game you've been eyeing, a day off chores.")); };
    drawList();
    const newIn = input("newreward", "", { placeholder: "Add a reward…" });
    const body = h("div", null,
      h("p", { class: "small muted" }, "Every 25% of a goal unlocks a reward. Fun money is a slice of what you just saved — capped, and never more than 10% of the goal — so the reward can't undo the progress."),
      field("Reward type", h("select", { name: "mode", onchange: (e) => { r.mode = e.target.value; save(); } }, ...[["both", "Fun money or a pick from my list"], ["money", "Fun money only"], ["list", "My list only"]].map(([v, l]) => h("option", { value: v, selected: r.mode === v }, l)))),
      h("div", { class: "field-row" },
        field("Fun money: % of the slice", numInput("rate", Math.round(r.rate * 100), { step: "1", min: "0", max: "20" }), "5% of a $1,000 goal → $12.50 per milestone"),
        field("Cap per milestone", numInput("cap", r.cap, { step: "1", min: "0" }))),
      h("h3", null, "My reward list"), listEl,
      h("div", { class: "row mt" }, newIn, h("button", { class: "btn sm", onclick: () => { const v = newIn.value.trim(); if (!v) return; r.list.push({ id: uid(), name: v }); newIn.value = ""; save(); drawList(); } }, "Add")));
    body.querySelector("[name=rate]").onchange = (e) => { r.rate = Math.max(0, Math.min(0.2, (Number(e.target.value) || 0) / 100)); save(); };
    body.querySelector("[name=cap]").onchange = (e) => { r.cap = Math.max(0, Number(e.target.value) || 0); save(); };
    return card(null, "", body, deckEditor(), notifySetup());
  },
  mascot() {
    const el = card(null, "");
    const draw = () => {
      el.innerHTML = "";
      const imgs = loadImages();
      const file = h("input", { type: "file", accept: "image/*", multiple: true, style: { display: "none" } });
      file.onchange = async () => {
        let n = 0;
        for (const f of file.files) { try { const r = await addImageFile(f); if (!r) { toast("Storage full — remove some pictures"); break; } n++; } catch (e) { toast("Couldn't read " + f.name); } }
        draw(); if (n) toast(n + " added");
      };
      el.append(...[
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: S.settings.mascot !== false, onchange: (e) => { S.settings.mascot = e.target.checked; save(); draw(); } }), h("span", null, h("b", null, "Show the mascot"), h("div", { class: "small muted" }, "Peeks in on level-ups, badges and milestones only, with a speech bubble."))),
        styleBlock(),
        h("p", { class: "small muted mt" }, "Pick any pictures from the phone. One is shown at random each time. They stay on this phone only (not in backups) and are resized to save space."),
        h("label", { class: "check" }, h("input", { type: "checkbox", checked: S.settings.mascotCutout !== false, onchange: (e) => { S.settings.mascotCutout = e.target.checked; save(); } }), h("span", null, h("b", null, "Cut out the background"), h("div", { class: "small muted" }, "Plain or white backgrounds are removed so she stands alone. Works best on images with a flat background."))),
        imgs.length ? h("button", { class: "btn sm ghost", onclick: async () => { toast("Cutting out…"); const n = await recutAll(); toast(`${n} of ${loadImages().length} cut out`); draw(); } }, "Cut out backgrounds on the pictures I already added") : null,
        MASCOTS.length ? h("h3", { class: "mt" }, `Built in (${builtinImages().length} of ${MASCOTS.length})`) : null,
        MASCOTS.length ? h("div", { class: "mascot-thumbs" }, ...MASCOTS.map((data, i) => { const id = "b" + i, hidden = (S.settings.mascotHidden || []).includes(id); return h("div", { style: hidden ? { opacity: .35 } : null }, h("img", { src: data }), h("button", { title: hidden ? "Show" : "Hide", onclick: () => { hideBuiltin(id, !hidden); draw(); } }, hidden ? "+" : "–")); })) : null,
        h("h3", { class: "mt" }, `Added by you (${imgs.length})`),
        h("div", { class: "mascot-thumbs" }, ...imgs.map((im) => h("div", null, h("img", { src: im.data }), h("button", { title: "Remove", onclick: () => { saveImages(loadImages().filter((x) => x.id !== im.id)); draw(); } }, "✕")))),
        h("div", { class: "row mt" }, h("button", { class: "btn cyan", onclick: () => file.click() }, "+ Add pictures"), file,
          h("button", { class: "btn ghost sm", onclick: () => peek("badge") }, "Preview"),
          imgs.length ? h("button", { class: "btn ghost sm", onclick: () => confirmBox("Remove all mascot pictures?", () => { saveImages([]); draw(); }, "Remove") }, "Clear") : null)].filter(Boolean));
    };
    draw();
    return el;
  },
  caps() {
    const b = S.settings.budgets;
    S.settings.pct = S.settings.pct || {};
    const cats = S.categories.filter((c) => !["income", "other"].includes(c.id));
    const inp = (attrs) => h("input", { type: "number", inputmode: "decimal", style: { width: "4.6rem", background: "rgba(8,5,18,.8)", border: "1px solid var(--line-strong)", borderRadius: "8px", padding: ".3rem .4rem", minHeight: "36px", textAlign: "right" }, ...attrs });
    const el = card(null, "");
    const draw = () => {
      el.innerHTML = "";
      const tp = totalPct();
      el.append(h("p", { class: "small muted" }, `Each category gets a share of income by default (needs about 66%, wants 19%, savings 15%). Change the percent, or type a fixed dollar amount to override it. ${income() ? "" : "Set income in Income & basics to see dollar figures."}`),
        h("div", { class: "row between small", style: { padding: ".3rem 0", borderBottom: "1px solid var(--line-strong)" } }, h("b", null, "Total"), h("b", { class: tp > 100 ? "danger" : tp < 95 ? "amber" : "lime" }, tp + "% of income")),
        ...cats.map((c) => {
          const fixed = !!b[c.id];
          return h("div", { class: "row between", style: { padding: ".35rem 0", borderBottom: "1px solid var(--line)" } },
            h("span", { class: "row" }, catDot(c.id), h("span", null, c.name, h("div", { class: "tiny " + (fixed ? "amber" : "dim") }, fixed ? "fixed amount" : `${fmt0(capFor(c.id))} / month`))),
            h("div", { class: "row", style: { gap: ".3rem" } },
              inp({ value: pctFor(c.id), step: "1", min: "0", max: "100", title: "percent of income", onchange: (e) => { S.settings.pct[c.id] = Math.max(0, Number(e.target.value) || 0); save(); draw(); } }), h("span", { class: "tiny muted" }, "%"),
              inp({ value: b[c.id] ?? "", placeholder: "$", step: "1", min: "0", title: "fixed dollars (overrides %)", onchange: (e) => { const v = Number(e.target.value) || 0; if (v) b[c.id] = v; else delete b[c.id]; save(); draw(); } })));
        }),
        h("button", { class: "btn sm ghost mt", onclick: () => { S.settings.pct = {}; S.settings.budgets = {}; save(); draw(); toast("Back to defaults"); } }, "Reset to defaults"));
    };
    draw();
    return el;
  },
  rules() {
    return card(null, "", h("p", { class: "small muted" }, "Made when you tick 'Always file … here' on a transaction. First match wins."),
      S.rules.length ? h("ul", { class: "list" }, ...S.rules.map((r) => h("li", null, catDot(r.cat), h("div", { class: "main" }, h("div", { class: "title" }, r.match), h("div", { class: "meta" }, catName(r.cat))), h("button", { class: "btn sm ghost", onclick: () => { S.rules = S.rules.filter((x) => x !== r); save(); refresh(); } }, "✕")))) : empty("No rules yet."),
      S.rules.length ? h("button", { class: "btn sm mt", onclick: () => { const n = applyRulesTo(S.tx); save(); toast(n + " refiled"); } }, "Re-apply to everything") : null);
  },
  badges() {
    const have = (t) => Object.entries(BADGES).filter(([id, b]) => b.tier === t && S.game.badges[id]).length;
    const all = (t) => Object.values(BADGES).filter((b) => b.tier === t).length;
    return card(null, "", ...[1, 2, 3].map((t) => h("div", { class: "mb" },
      h("h3", { style: { color: TIERS[t].color } }, `${TIERS[t].name} · ${have(t)} of ${all(t)}`),
      h("div", { class: "badge-grid" }, ...Object.entries(BADGES).filter(([, b]) => b.tier === t).map(([id, b]) => h("button", { type: "button", class: "badge tier" + t + (S.game.badges[id] ? " on" : ""), style: S.game.badges[id] ? { borderColor: TIERS[t].color, boxShadow: `0 0 14px ${TIERS[t].color}66` } : null, "aria-label": `${b.name}, ${S.game.badges[id] ? "earned" : "locked"}`, onclick: () => badgeSheet(id) }, h("div", { class: "ico", "aria-hidden": "true" }, b.ico), h("div", { class: "nm" }, b.name)))))),
      h("p", { class: "tiny muted" }, "Tap a badge to see how it's earned."));
  },
  help() { return helpSection(); },
  about() {
    const android = notif.available();
    const row = (k, v) => h("div", { class: "row between small", style: { padding: ".25rem 0", borderBottom: "1px solid var(--line)" } }, h("span", { class: "muted" }, k), h("span", null, v));
    const p = (head, text) => h("p", { class: "small" }, h("b", null, head + " "), text);
    return card(null, "",
      row("App", "Glowstick"), row("Version", APP_VERSION), row("Build profile", PROFILE), row("Running in", android ? "Android app" : "browser"),
      h("h3", { class: "mt" }, "What is stored, and where"),
      p("Your money data", "(transactions, bills, goals, loans, rules, settings, the game state) is kept in this device's browser storage (localStorage, one key: glowstick.v1). It never leaves the device. There is no account and no server, and the Android app has no internet permission."),
      p("Captured notifications", "(Android only, off by default) are kept in Glowstick's app-private preferences on this phone, newest 400, and are read into the Spend inbox when you open the app. Nothing is transmitted."),
      p("Mascot pictures", "you add are resized and kept in this device's browser storage."),
      p("Texts", "are sent only if you turn 'Tell someone' on and give a number; automatic sending additionally needs the SMS permission you grant on the phone. Otherwise the messaging app opens and you press Send yourself."),
      p("Nothing is transmitted", "by the app itself: no analytics, no crash reports, no sync."),
      h("h3", { class: "mt" }, "Backup includes / excludes"),
      p("Includes:", "everything under glowstick.v1 — settings (including the 'Tell someone' name and number), categories, transactions, rules, bills, goals, loans, pending captures, holds, game progress."),
      p("Excludes:", "mascot pictures, the phone-side notification queue, and Android permission grants. Re-add pictures and re-grant permissions after restoring on a new phone."),
      h("h3", { class: "mt" }, "Privacy policy"),
      h("p", { class: "small muted" }, "Not yet written — add before public release."),
      h("h3", { class: "mt" }, "Terms"),
      h("p", { class: "small muted" }, "Not yet written — add before public release."));
  },
  data() {
    const file = h("input", { type: "file", accept: ".json,application/json", style: { display: "none" } });
    file.onchange = async () => { const f = file.files[0]; if (!f) return; try { const obj = JSON.parse(await readFileText(f)); validateBackup(obj); confirmBox("Replace everything with this backup?", () => { if (!replaceState(obj)) { toast("Restore failed; current data was kept. Export a backup and free storage."); return; } section = null; go("home"); toast("Restored"); }, "Replace"); } catch (e) { toast("Invalid backup: " + e.message); } };
    return card(null, "", h("p", { class: "small muted" }, `${S.tx.length} transactions, ${S.bills.length} bills, ${S.goals.length} goals, ${S.loans.length} loans. Everything is in this phone's storage only; a backup is the only copy that survives uninstalling.`),
      h("div", { class: "row" },
        h("button", { class: "btn cyan", onclick: () => exportJSON(S, `glowstick-backup-${today()}.json`) }, "Export backup"),
        h("button", { class: "btn", onclick: () => file.click() }, "Restore backup"), file,
        h("button", { class: "btn danger", onclick: () => confirmBox("Erase everything? There is no undo.", () => { if (!replaceState(blank())) { toast("Erase failed; current data was kept"); return; } section = null; go("home"); if (shouldShowIntro()) setTimeout(() => showIntro(0), 300); }, "Erase") }, "Erase all")));
  },
};

// One badge: icon, tier, how to earn it, earned date or progress.
function badgeSheet(id) {
  const b = BADGES[id]; if (!b) return;
  const tier = TIERS[b.tier];
  const earned = S.game.badges[id];
  const p = earned ? null : badgeProgress(id);
  const body = h("div", { class: "badge-sheet" },
    h("div", { class: "badge-big", style: { borderColor: tier.color, boxShadow: earned ? `0 0 24px ${tier.color}66` : "none", opacity: earned ? 1 : .6 }, "aria-hidden": "true" }, b.ico),
    h("div", { class: "tiny", style: { color: tier.color, textTransform: "uppercase", letterSpacing: ".1em", textAlign: "center" } }, tier.name),
    h("p", { class: "small", style: { textAlign: "center" } }, h("b", null, "How to earn: "), b.how),
    earned ? h("p", { class: "lime", style: { textAlign: "center", fontWeight: 700 } }, "Earned on " + dateLabelY(earned)) : h("p", { class: "muted", style: { textAlign: "center", fontWeight: 700 } }, "Not yet"),
    p ? h("div", null, h("div", { class: "row between small", style: { marginBottom: ".3rem" } }, h("span", null, "Progress"), h("b", null, p.money ? `${fmt0(p.have)} of ${fmt0(p.need)}` : `${p.have} of ${p.need}`)), bar(p.need ? p.have / p.need : 0, "lime", b.name + " progress")) : null);
  modal(b.name, body, [h("button", { class: "btn primary", onclick: closeModal }, "Close")]);
}

// More → Mascot → Style: one chip row per cosmetic kind (js/cosmetics.js) and a live preview of the stick.
// Locked chips are greyed with their unlock rule; tapping one only explains it. Photos take colour, bubble and
// motion; face and accessory show on the built-in stick only, which is what the preview draws.
function styleBlock() {
  const wrap = h("div", { class: "style-block" });
  const preview = h("div", { class: "style-preview" });
  const drawPreview = () => {
    const sty = styleFor(stateFor("idle"));
    preview.className = "style-preview b-" + sty.bubble;
    preview.style.setProperty("--aura", sty.aura);
    preview.innerHTML = `<div class="bubble">Looking good.</div><div class="figure">${stickSVG(sty.face, sty.aura, 120, { accessory: sty.accessory, color: sty.color })}</div>`;
  };
  const rows = h("div", { class: "style-rows" });
  const drawRows = () => {
    rows.innerHTML = "";
    const eq = equipped();
    for (const kind of KINDS) {
      rows.append(h("div", { class: "style-row" }, h("div", { class: "label" }, KIND_NAMES[kind]),
        h("div", { class: "chips", role: "group", "aria-label": KIND_NAMES[kind] }, ...byKind(kind).map((it) => {
          const ok = unlocked(it), on = eq[kind] === it.id;
          return h("button", { type: "button", class: "chip" + (on ? " active" : "") + (ok ? "" : " locked"), "aria-pressed": on ? "true" : "false", "aria-disabled": ok ? null : "true", title: ok ? it.name : unlockLabel(it),
            onclick: () => { if (!ok) { toast(`${it.name}: unlocks at ${unlockLabel(it)}`); return; } if (equip(kind, it.id)) { drawRows(); drawPreview(); } } },
            it.swatch ? h("span", { class: "swatch", style: { background: it.swatch }, "aria-hidden": "true" }) : null,
            h("span", null, it.name),
            ok ? null : h("span", { class: "unlock" }, unlockLabel(it)));
        }))));
    }
  };
  drawRows(); drawPreview();
  wrap.append(h("h3", null, "Style"), h("p", { class: "small muted" }, "Looks unlock as you level up and earn badges. Face and accessory show on the built-in stick; colour, bubble and motion also apply to your pictures."), preview, rows);
  return wrap;
}

function appPicker() {
  const apps = notif.seenApps();
  const chosen = new Set(S.settings.notifApps || []);
  if (!apps.length) return h("p", { class: "small muted" }, "No notifications seen yet. Once your bank or Wallet posts one, it appears here.");
  return h("div", null, ...apps.map((a) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: chosen.has(a.pkg), onchange: (e) => { if (e.target.checked) chosen.add(a.pkg); else chosen.delete(a.pkg); S.settings.notifApps = [...chosen]; save(); } }), h("span", null, a.app || a.pkg, h("span", { class: "tiny dim" }, ` · ${a.pkg} · ${a.count}`)))));
}

function showMapping(rows, m, out) {
  out.innerHTML = "";
  const header = m.hasHeader ? rows[0] : rows[0].map((_, i) => "col " + (i + 1));
  const opt = (name, val) => h("select", { name }, h("option", { value: -1, selected: val < 0 }, "— none —"), ...header.map((hd, i) => h("option", { value: i, selected: val === i }, hd || "col " + (i + 1))));
  const body = h("div", null,
    h("div", { class: "map-grid" },
      field("Date", opt("date", m.date)), field("Description", opt("desc", m.desc)),
      field("Amount (signed)", opt("amount", m.amount)), field("Type column (optional)", opt("type", m.type)),
      field("Debit / money out", opt("debit", m.debit)), field("Credit / money in", opt("credit", m.credit))),
    h("label", { class: "check" }, h("input", { type: "checkbox", name: "flip", checked: m.flip }), h("span", null, "Spending is shown as positive in this file (flip signs)")),
    h("label", { class: "check" }, h("input", { type: "checkbox", name: "hasHeader", checked: m.hasHeader }), h("span", null, "First row is a header")),
    h("div", { id: "prev" }));
  const prev = () => {
    const f = readForm(body);
    const mm = { date: f.date, desc: f.desc, amount: f.amount, type: f.type, debit: f.debit, credit: f.credit, flip: f.flip, hasHeader: f.hasHeader };
    const r = buildTransactions(rows, mm);
    const p = body.querySelector("#prev");
    p.innerHTML = "";
    // Group the per-row problems by reason so a 500-row file with one broken column reads as one line.
    const byReason = {};
    for (const pr of r.problems) (byReason[pr.reason] = byReason[pr.reason] || []).push(pr.row);
    const problemLines = Object.entries(byReason).map(([reason, rows]) => h("li", { class: "small" }, h("b", null, rows.length), ` ${reason}`, h("span", { class: "muted" }, ` · row${rows.length === 1 ? "" : "s"} ${rows.slice(0, 8).join(", ")}${rows.length > 8 ? "…" : ""}`)));
    p.append(...[h("p", { class: "small" }, summarize(r)),
      r.tx.length ? null : h("p", { class: "small amber" }, r.duplicates && !r.problems.length ? "Everything in this file is already in." : "Nothing parsed — check the columns above."),
      problemLines.length ? h("ul", { class: "problem-list", "aria-label": "Rows that could not be read" }, ...problemLines) : null,
      h("div", { class: "preview-box" }, r.tx.slice(0, 8).map((t) => `${t.date}  ${t.amount < 0 ? "-" : "+"}${Math.abs(t.amount).toFixed(2).padStart(9)}  ${t.desc.slice(0, 32)}  → ${catName(t.cat)}`).join("\n") || "(no new transactions)"),
      h("button", { class: "btn primary block mt", disabled: !r.tx.length, onclick: () => {
        S.tx.push(...r.tx);
        const matched = autoMatchBills(r.tx);
        save(); touch(); addXP(XP.csvImport, "imported"); award("import"); checkQuests();
        toast(`${r.tx.length} imported${matched ? ", " + matched + " bill" + (matched === 1 ? "" : "s") + " ticked" : ""}`, "xp");
        out.innerHTML = ""; refresh();
      } }, `Import ${r.tx.length}`)].filter(Boolean));
  };
  body.querySelectorAll("select,input").forEach((el) => el.addEventListener("change", prev));
  prev();
  out.append(body);
}

// ---- Permission explainers. Shown BEFORE any system permission screen so the person knows what they are
// agreeing to. Cancel = nothing happens. The system screen only opens from the confirm button.
function explainer(title, lines, onOk, okLabel) {
  modal(title, h("div", null, ...lines.map(([head, text]) => h("p", { class: "small" }, h("b", null, head + " "), text))), [
    h("button", { class: "btn ghost", onclick: closeModal }, "Not now"),
    h("button", { class: "btn primary", onclick: () => { closeModal(); onOk(); } }, okLabel),
  ]);
}

function explainNotifAccess(onOk) {
  explainer("Read bank notifications?", [
    ["What is read:", "the title and text of notifications posted by the apps you tick (bank, Wallet). With none ticked, any notification that mentions an amount."],
    ["Where it goes:", "this phone only, in Glowstick's private app storage (newest 400 kept). Nothing is transmitted; the app has no internet permission."],
    ["When it is processed:", "when you open or return to Glowstick. Anything that looks like money moving lands in Spend → Inbox for you to confirm or discard."],
    ["Switching off:", "untick this box at any time, or remove Glowstick on the Notification access screen. The stored queue is cleared as it is read."],
    ["If you say no:", "typing transactions in and importing the bank's CSV keep working exactly as before."],
  ], onOk, "Open Android settings");
}

// Runs after the system Notification-access screen: when the app comes back and access is still missing, the
// feature stays off and the person is told the fallbacks still work.
function openNotifAccessAndWatch() {
  notif.openAccess();
  watchReturn(() => {
    if (notif.hasAccess()) { toast("Notification capture is on"); refresh(); return; }
    S.settings.sources.notif = false; save(); refresh();
    toast("Notification capture stays off. Manual entry and CSV import still work.");
  });
}

function explainSmsAuto(onOk) {
  explainer("Send texts automatically?", [
    ["What is sent:", "a short text with the coupon name, to the number you typed above. Nothing else, and never to anyone else."],
    ["When:", "only when a card is drawn or redeemed, and only for the events ticked above."],
    ["Where it is stored:", "the name and number live in this app's settings on this phone. Texts go through your phone's normal SMS."],
    ["Switching off:", "untick 'Send automatically' at any time; Android can also revoke the SMS permission."],
    ["If you say no:", "the composer fallback still works — the messaging app opens with the text ready and you tap Send."],
  ], onOk, "Ask for SMS permission");
}

// Calls fn once, the next time the page regains visibility or focus (the Android wrapper dispatches
// visibilitychange from onResume). Falls back to a timer so the check always runs.
function watchReturn(fn) {
  let done = false;
  const run = () => { if (done) return; done = true; document.removeEventListener("visibilitychange", run); window.removeEventListener("focus", run); setTimeout(fn, 300); };
  document.addEventListener("visibilitychange", run);
  window.addEventListener("focus", run);
  setTimeout(run, 60000);
}

// ---- Notify someone by text when a coupon is earned / redeemed, so they can get the reward ready.
function notifySetup() {
  const n = (S.settings.notify = { ...DEFAULT_NOTIFY, ...(S.settings.notify || {}) });
  const el = h("div", { class: "mt" });
  const draw = () => {
    el.innerHTML = "";
    const canAuto = canAutoSend();
    const status = smsStatus();
    if (n.auto && canAuto && !hasSms()) n.auto = false; // permission gone (revoked, or store flavor): reflect it
    el.append(h("h3", null, "Tell someone"),
      h("p", { class: "small muted" }, "When a card is drawn or redeemed, text the person who has to deliver it. By default the phone's messaging app opens with the text ready to send (one tap). Automatic sending needs the SMS permission and only works in the Android app."),
      h("div", { class: "field-row" }, field("Their name", input("nname", n.name, { placeholder: "Name" })), field("Phone number", input("nphone", n.phone, { type: "tel", placeholder: "+1 555 123 4567" }))),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: n.onEarn, onchange: (e) => { n.onEarn = e.target.checked; save(); } }), h("span", null, "Text when a card is drawn")),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: n.onRedeem, onchange: (e) => { n.onRedeem = e.target.checked; save(); } }), h("span", null, "Text when a card is redeemed")),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: n.auto, disabled: !canAuto, onchange: (e) => {
        if (!e.target.checked) { n.auto = false; save(); draw(); return; }
        if (hasSms()) { n.auto = true; save(); draw(); return; }
        e.target.checked = false;
        explainSmsAuto(() => {
          requestSms();
          watchReturn(() => {
            if (hasSms()) { n.auto = true; save(); toast("Automatic texts are on"); }
            else { n.auto = false; save(); toast("Automatic sending stays off. The composer still opens with the text ready."); }
            draw();
          });
        });
      } }), h("span", null, h("b", null, "Send automatically"), h("div", { class: "small muted" }, canAuto ? `No composer; the text just goes. SMS permission: ${status}.` : "Android app only. In a browser the messaging app opens instead."))),
      h("div", { class: "row mt" }, h("button", { class: "btn sm", onclick: () => { n.name = el.querySelector("[name=nname]").value.trim(); n.phone = el.querySelector("[name=nphone]").value.trim(); save(); toast("Saved"); } }, "Save"), n.phone ? h("button", { class: "btn ghost sm", onclick: () => sendText("Glowstick test: this is the coupon alert.") }, "Send a test") : null));
  };
  draw();
  return el;
}
