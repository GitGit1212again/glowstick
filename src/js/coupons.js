// Coupons: a card deck in three categories (editable). Good spending habits earn DRAWS; he picks the category,
// the card dealt from it is random; the card waits in the wallet on Home until he redeems it (which texts the giver).
// Difficulty ramps: the first draw comes on the first trigger, later draws need more triggers each, up to a ceiling.
import { S, save, uid, today } from "./state.js";
import { emit } from "./events.js";

export const TRIGGERS = {
  weekWin: { name: "A week inside every impulse allowance", short: "week won" },
  restraint3: { name: "3 restraint quests in a row", short: "3 restraint days" },
  restraint7: { name: "7 restraint quests done", short: "7 restraint days" },
  streak7: { name: "Every 7 days of streak", short: "7-day streak" },
  streak30: { name: "Every 30 days of streak", short: "30-day streak" },
  milestone50: { name: "A goal reaches 50%", short: "goal halfway" },
  milestone100: { name: "A goal is finished", short: "goal done" },
  levelup: { name: "Any level-up", short: "level-up" },
  hold5: { name: "Every 5 holds skipped", short: "5 skips" },
  billMonth: { name: "Every bill paid on time in a month", short: "clean bill month" },
};
export const RAMPS = { none: { step: 0, cap: 1 }, gentle: { step: 1, cap: 3 }, steady: { step: 1, cap: 5 }, steep: { step: 2, cap: 8 } };
export const DEFAULT_CATS = [
  { id: "sexy", name: "Sexy time", color: "#ff2fd2" },
  { id: "food", name: "Food & leisure", color: "#c3ff3d" },
  { id: "gaming", name: "Gaming", color: "#21f0ff" },
];
export const DEFAULT_CARDS = [
  { title: "Date night", note: "Dinner out, my pick, my treat.", cat: "food" },
  { title: "Takeout of your choice", note: "Guilt-free. Doesn't count against the allowance.", cat: "food" },
  { title: "Movie night, you pick", note: "Snacks included.", cat: "food" },
  { title: "Sleep-in Saturday", note: "No chores till noon.", cat: "food" },
  { title: "Gaming night, no interruptions", note: "Three hours. Headset on, door shut.", cat: "gaming" },
  { title: "New game", note: "Up to $30, your pick. Doesn't count against the allowance.", cat: "gaming" },
  { title: "Co-op night", note: "I play what you pick.", cat: "gaming" },
  { title: "Your call tonight", note: "Write your own fine print.", cat: "sexy" },
  { title: "Massage", note: "Twenty minutes. No clock-watching.", cat: "sexy" },
  // The wildcard can come up from any category (rarer than a normal card). He names what he wants when he redeems it.
  { title: "Wildcard", note: "Any one thing you want. Name it when you redeem.", cat: "any", wild: true, weight: 0.35 },
];
export const ANY = "any";

function cfg() {
  const r = (S.settings.coupons2 = S.settings.coupons2 || {});
  if (!r.cats || !r.cats.length) r.cats = DEFAULT_CATS.map((c) => ({ ...c }));
  if (!Array.isArray(r.cards)) r.cards = DEFAULT_CARDS.map((c) => ({ id: uid(), enabled: true, ...c }));
  if (!r.cards.some((c) => c.wild) && !r.wildRemoved) r.cards.push({ id: uid(), enabled: true, ...DEFAULT_CARDS.find((c) => c.wild) });
  if (!Array.isArray(r.triggers)) r.triggers = Object.keys(TRIGGERS);
  if (!r.ramp) r.ramp = "gentle";
  return r;
}
function st() { const g = (S.game.draws = S.game.draws || { available: 0, progress: 0, earned: 0, wallet: [] }); if (!g.wallet) g.wallet = []; return g; }

export const cats = () => cfg().cats;
export const cat = (id) => cats().find((c) => c.id === id) || cats()[0] || { id: "none", name: "Coupon", color: "#9b6bff" };
export const cards = () => cfg().cards;
// Cards a category can deal: its own cards plus any "any-category" cards (wildcards).
export const cardsIn = (catId) => cards().filter((c) => c.enabled !== false && ((c.cat || cats()[0]?.id) === catId || c.cat === ANY));
export const ownCardsIn = (catId) => cardsIn(catId).filter((c) => c.cat !== ANY);
// Categories that actually have something to deal.
export const dealableCats = () => cats().filter((k) => ownCardsIn(k.id).length > 0);
export const triggersOn = () => cfg().triggers;
export const ramp = () => RAMPS[cfg().ramp] || RAMPS.gentle;
export const setRamp = (k) => { cfg().ramp = k; save(); };
export const setTrigger = (id, on) => { const t = cfg().triggers; cfg().triggers = on ? [...new Set([...t, id])] : t.filter((x) => x !== id); save(); };

export function needed() { const g = st(), r = ramp(); return Math.max(1, Math.min(1 + (g.earned || 0) * r.step, r.cap)); }
export function progress() { const g = st(); return { have: g.progress, need: needed(), available: g.available, earned: g.earned }; }

// A habit trigger fired. Counts toward the next draw; grants it when the ramp says so.
export function trigger(id, detail) {
  if (!triggersOn().includes(id)) return false;
  const g = st();
  g.progress++;
  if (g.progress < needed()) { save(); emit({ type: "drawProgress", have: g.progress, need: needed(), why: TRIGGERS[id]?.short || id }); return false; }
  g.progress = 0; g.earned++; g.available++;
  save();
  emit({ type: "draw", available: g.available, why: TRIGGERS[id]?.short || id, detail: detail || "", next: needed() });
  return true;
}

// He picks a category; a random enabled card from it is dealt into the wallet.
// Returns null (and spends nothing) when there is no draw or the category has no enabled cards.
export function deal(catId) {
  const g = st();
  if (!(g.available > 0)) return null;
  if (!cats().some((k) => k.id === catId)) return null;
  const pool = cardsIn(catId);
  if (!pool.filter((c) => c.cat !== ANY).length) return null;
  // weighted pick: a normal card weighs 1, a wildcard its `weight` (rarer)
  const weights = pool.map((c) => (c.wild ? Number(c.weight) || 0.35 : 1));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0), c = pool[0];
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) { c = pool[i]; break; } }
  const lines = String(c.note || "").split(/\r?\n+/).map((x) => x.trim()).filter(Boolean);
  const dealtBefore = g.wallet.filter((w) => w.cardId === c.id).length; // rotates the fine-print line per deal
  const note = lines.length ? lines[dealtBefore % lines.length] : "";
  const e = { id: today() + ":" + c.id + ":" + Math.random().toString(36).slice(2, 6), cardId: c.id, cat: catId, title: c.title, note, earned: today(), redeemed: null, wild: !!c.wild };
  g.wallet.unshift(e);
  g.available--;
  save();
  emit({ type: "coupon", title: c.title, note, cat: cat(catId).name });
  return e;
}

export function wallet() { return st().wallet.filter((w) => !w.redeemed); }
export function redeemed() { return st().wallet.filter((w) => w.redeemed); }
// `wish` is what he asked for on a wildcard; it becomes the note and goes in the text.
export function redeem(e, wish) {
  if (!e || e.redeemed) return false;
  if (e.wild && wish) e.note = String(wish).trim().slice(0, 200);
  e.redeemed = today(); save();
  emit({ type: "redeem", title: e.wild && e.note ? `Wildcard: ${e.note}` : e.title, note: e.wild ? "" : (e.note || ""), cat: cat(e.cat).name });
  return true;
}

// editing
export function addCard(rec) { cfg().cards.push({ id: uid(), enabled: true, ...rec }); save(); }
export function updateCard(id, rec) { const c = cfg().cards.find((x) => x.id === id); if (c) Object.assign(c, rec); save(); }
export function removeCard(id) { const r = cfg(); if (r.cards.find((x) => x.id === id)?.wild) r.wildRemoved = true; r.cards = r.cards.filter((x) => x.id !== id); save(); }
export function resetCards() { cfg().cards = DEFAULT_CARDS.map((c) => ({ id: uid(), enabled: true, ...c })); save(); }
export function addCat() { cfg().cats.push({ id: uid(), name: "New category", color: "#9b6bff" }); save(); }
export function removeCat(id) { const r = cfg(); if (r.cats.length <= 1) return; r.cats = r.cats.filter((c) => c.id !== id); for (const c of r.cards) if (c.cat === id) c.cat = r.cats[0].id; save(); }
export function giveDraw(n = 1) { st().available += n; save(); } // manual bonus draw from the giver
