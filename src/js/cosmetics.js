// Mascot cosmetics: looks the built-in stick (and, partly, the photo mascots) can wear, unlocked by progress.
// One data table, COSMETICS; add a row and it shows up in More → Mascot → Style with its unlock rule.
//
// kind:    color | face | accessory | bubble | motion
// unlock:  {} (always) | { level: n } | { badge: id } | { tier: n }  (any earned badge of tier >= n)
// render data by kind:
//   color      aura (glow + bubble border; null = keep the state's own colour), tube (gradient stops, optional)
//   face       drawn by ui/mascot.js FACES[id]; the stick only
//   accessory  drawn by ui/mascot.js ACCESSORIES[id]; the stick only
//   bubble     CSS class b-<id> on the .mascot element (see css/mascot.css)
//   motion     CSS class m-<id>; "surprise" = the state's own motion (varies with the moment)
// Colour, bubble and motion also apply to photo mascots; face and accessory are stick-only.
import { S, save } from "./state.js";
import { levelFor, BADGES, TIERS } from "./game.js";

export const KINDS = ["color", "face", "accessory", "bubble", "motion"];
export const KIND_NAMES = { color: "Colour", face: "Face", accessory: "Accessory", bubble: "Bubble", motion: "Motion" };
export const DEFAULTS = Object.freeze({ color: "violet", face: "classic", accessory: "none", bubble: "white", motion: "surprise" });

export const COSMETICS = [
  // colours
  { id: "violet", kind: "color", name: "Violet", unlock: {}, aura: null, swatch: "#9b6bff" },
  { id: "cyan", kind: "color", name: "Cyan", unlock: { level: 2 }, aura: "#21f0ff", swatch: "#21f0ff" },
  { id: "lime", kind: "color", name: "Lime", unlock: { level: 3 }, aura: "#c3ff3d", swatch: "#c3ff3d" },
  { id: "pink", kind: "color", name: "Pink", unlock: { level: 4 }, aura: "#ff2fd2", swatch: "#ff2fd2" },
  { id: "amber", kind: "color", name: "Amber", unlock: { level: 6 }, aura: "#ffb52e", swatch: "#ffb52e" },
  { id: "sunset", kind: "color", name: "Sunset", unlock: { level: 8 }, aura: "#ff7a3d", swatch: "linear-gradient(135deg,#ff2fd2,#ff7a3d,#ffd54a)", tube: ["#ff2fd2", "#ff7a3d", "#ffd54a"] },
  { id: "gold", kind: "color", name: "Gold", unlock: { level: 10 }, aura: "#ffd54a", swatch: "linear-gradient(135deg,#b8860b,#ffd54a,#fff3b0)", tube: ["#c99a1a", "#ffd54a", "#fff3b0"] },
  // faces
  { id: "classic", kind: "face", name: "Classic", unlock: {} },
  { id: "wink", kind: "face", name: "Wink", unlock: { level: 2 } },
  { id: "star", kind: "face", name: "Star eyes", unlock: { level: 5 } },
  { id: "shades", kind: "face", name: "Shades", unlock: { level: 7 } },
  { id: "smug", kind: "face", name: "Smug", unlock: { badge: "ironwill" } },
  { id: "sparkle", kind: "face", name: "Sparkle", unlock: { tier: 3 } },
  // accessories
  { id: "none", kind: "accessory", name: "None", unlock: {} },
  { id: "bow", kind: "accessory", name: "Bow & lashes", unlock: { level: 3 } },
  { id: "cap", kind: "accessory", name: "Cap", unlock: { level: 4 } },
  { id: "headphones", kind: "accessory", name: "Headphones", unlock: { level: 6 } },
  { id: "halo", kind: "accessory", name: "Halo", unlock: { badge: "goalDone" } },
  { id: "crown", kind: "accessory", name: "Crown", unlock: { level: 10 } },
  // speech bubbles
  { id: "white", kind: "bubble", name: "White", unlock: {} },
  { id: "neon", kind: "bubble", name: "Neon", unlock: { level: 3 } },
  { id: "glass", kind: "bubble", name: "Glass", unlock: { level: 5 } },
  { id: "gold", kind: "bubble", name: "Gold", unlock: { level: 10 } },
  // motions
  { id: "surprise", kind: "motion", name: "Surprise me", unlock: {} },
  { id: "bounce", kind: "motion", name: "Bounce", unlock: { level: 2 } },
  { id: "sway", kind: "motion", name: "Sway", unlock: { level: 2 } },
  { id: "wiggle", kind: "motion", name: "Wiggle", unlock: { level: 2 } },
  { id: "lean", kind: "motion", name: "Lean", unlock: { level: 2 } },
  { id: "nod", kind: "motion", name: "Nod", unlock: { level: 2 } },
];

export function byKind(kind) { return COSMETICS.filter((c) => c.kind === kind); }
export function find(kind, id) { return COSMETICS.find((c) => c.kind === kind && c.id === id) || null; }

const badgeIds = () => Object.keys(S.game?.badges || {});
const highestTier = () => badgeIds().reduce((m, id) => Math.max(m, BADGES[id]?.tier || 0), 0);

// Is this item earned yet? Levels come from xp, badges from S.game.badges, tiers from the best badge earned.
export function unlocked(item) {
  if (!item) return false;
  const u = item.unlock || {};
  if (u.level != null) return levelFor(S.game?.xp || 0) >= u.level;
  if (u.badge) return !!(S.game?.badges || {})[u.badge];
  if (u.tier != null) return highestTier() >= u.tier;
  return true;
}

export function unlockLabel(item) {
  const u = item?.unlock || {};
  if (u.level != null) return "Level " + u.level;
  if (u.badge) return "Badge: " + (BADGES[u.badge]?.name || u.badge);
  if (u.tier != null) return (TIERS[u.tier]?.name || "Tier " + u.tier) + " badge";
  return "Always";
}

// What is worn now: saved choices over the defaults; anything missing, unknown or since re-locked falls back.
export function equipped() {
  const st = S.settings?.mascotStyle || {};
  const out = {};
  for (const k of KINDS) {
    const it = find(k, st[k]);
    out[k] = it && unlocked(it) ? it.id : DEFAULTS[k];
  }
  return out;
}
export function equippedItems() { const e = equipped(); const out = {}; for (const k of KINDS) out[k] = find(k, e[k]); return out; }

// Wear something. Refuses unknown or locked items (returns false); true when saved.
export function equip(kind, id) {
  const it = find(kind, id);
  if (!it || !unlocked(it)) return false;
  S.settings.mascotStyle = { ...(S.settings.mascotStyle || {}), [kind]: id };
  save();
  return true;
}

// Items that became available between two xp values (levels crossed) and, if a badge id is given, by that badge:
// a direct badge unlock, or a tier unlock this badge is the first to satisfy.
export function newlyUnlocked(prevXp, newXp, badge) {
  const lo = levelFor(Number(prevXp) || 0), hi = levelFor(Number(newXp) || 0);
  const out = [];
  for (const it of COSMETICS) {
    const u = it.unlock || {};
    if (u.level != null && u.level > lo && u.level <= hi) out.push(it);
    if (badge && u.badge === badge) out.push(it);
    if (badge && u.tier != null) {
      const t = BADGES[badge]?.tier || 0;
      const othersBest = badgeIds().filter((id) => id !== badge).reduce((m, id) => Math.max(m, BADGES[id]?.tier || 0), 0);
      if (t >= u.tier && othersBest < u.tier) out.push(it);
    }
  }
  return out;
}
