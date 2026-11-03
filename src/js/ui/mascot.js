// Mascot: peeks in from the bottom-right with a speech bubble on level-ups, badges, milestones, holds and so on.
// Pictures: built-ins from the personal build (PERSONAL.mascots) plus anything the user adds in More → Mascot.
// When there are none (the store build, before the user adds any) a built-in character is drawn instead: the
// Glowstick brand mark — the neon tube from the icon — as an inline SVG "stick" with eyes and a mouth per state.
// Images live under their own localStorage key (not the main state) so backups stay small; resized on import.
//
// Adding a state = adding one entry to STATES (lines, face, motion, aura). Nothing else needs to change.
import { S, save } from "../state.js";
import { PERSONAL } from "../../data/personal.js";
import { equippedItems, find as findCosmetic } from "../cosmetics.js";

export const IMG_KEY = "glowstick.mascot.images";

// ---- state table ------------------------------------------------------------------------------------------
// face:   idle | happy | alert | sleepy      (expression of the built-in stick; ignored for pictures)
// motion: bounce | sway | wiggle | lean | nod | still   (CSS class m-<motion>)
// aura:   glow colour behind the character and on the bubble border
// ms:     how long it stays (default 2800)
const AURA = { pink: "#ff2fd2", cyan: "#21f0ff", lime: "#c3ff3d", amber: "#ffb52e", violet: "#9b6bff", soft: "#b78cff" };
export const STATES = {
  idle:       { face: "idle",   motion: "sway",   aura: AURA.violet, lines: ["Here when you need me.", "Nothing to do. That's fine too.", "Quiet day. Good."] },
  success:    { face: "happy",  motion: "bounce", aura: AURA.lime,   lines: ["Nice one.", "That's the habit forming.", "Knew you could.", "Good move. Keep going."] },
  budgetWin:  { face: "happy",  motion: "wiggle", aura: AURA.lime,   lines: ["Inside the line all week. That's real.", "The allowance held. So did you.", "Week won. That money is still yours."] },
  milestone:  { face: "happy",  motion: "bounce", aura: AURA.cyan,   lines: ["Milestone. Look how far that is.", "You put that there, bit by bit.", "See? It adds up."] },
  levelup:    { face: "happy",  motion: "bounce", aura: AURA.pink,   lines: ["Level up. Earned, not given.", "Look at you go.", "The bar's yours. Keep filling it."] },
  streak:     { face: "happy",  motion: "nod",    aura: AURA.amber,  lines: ["Another day showed up for. That's the whole trick.", "Streak's alive. One real thing a day.", "Consistency beats intensity. You're proving it."] },
  billSoon:   { face: "alert",  motion: "lean",   aura: AURA.amber,  lines: ["Heads up: a bill's coming this week. No panic, just a date.", "Something's due soon. Worth a look when you're ready.", "One bill on the horizon. You've got this."] },
  overspend:  { face: "alert",  motion: "sway",   aura: AURA.amber,  lines: ["Past the line this week. Now you know, and knowing is the useful part.", "Over for now. Next week starts fresh.", "It happens. The number's just information."] },
  hold:       { face: "idle",   motion: "nod",    aura: AURA.cyan,   lines: ["Good call letting it sit.", "The wait is the win. Whatever you decide.", "Paused. That's the whole skill."] },
  goalDone:   { face: "happy",  motion: "wiggle", aura: AURA.cyan,   lines: ["Goal done. You actually did it.", "That's a finished goal. Take it in.", "Done. What's next?"], ms: 3600 },
  error:      { face: "sleepy", motion: "still",  aura: AURA.soft,   lines: ["That didn't go through. Nothing lost.", "Hm, that one didn't work. Try again when you like.", "No harm done. Give it another go."] },
  onboarding: { face: "happy",  motion: "sway",   aura: AURA.pink,   lines: ["Hi. I show up when something good happens.", "I'm the glowstick. I light up for wins.", "You'll see me now and then. Only good news."], ms: 3400 },
  coupon:     { face: "happy",  motion: "bounce", aura: AURA.pink,   lines: ["You earned this one. Cash it in.", "Coupon time. Go collect.", "That's a draw. Enjoy it."] },
};
// older call sites
export const ALIASES = { badge: "success", win: "budgetWin", weekWin: "budgetWin", done: "goalDone", welcome: "onboarding", oops: "error" };
// A build that bundles its own pictures (src/data/personal.js) may also carry the lines they speak; none otherwise.
const PERSONAL_LINES = PERSONAL?.mascotLines || {};
export function stateFor(kind) { const k = ALIASES[kind] || kind; return STATES[k] ? { key: k, ...STATES[k] } : { key: "success", ...STATES.success }; }

// ---- pictures ---------------------------------------------------------------------------------------------
const BUILTIN = PERSONAL?.mascots || [];
// user-added pictures only (what the picker manages)
export function loadImages() { try { return JSON.parse(localStorage.getItem(IMG_KEY) || "[]"); } catch (e) { return []; } }
// built-ins shipped with the app, minus any the user hid
export function builtinImages() { const hidden = new Set(S.settings.mascotHidden || []); return BUILTIN.map((data, i) => ({ id: "b" + i, data, builtin: true })).filter((x) => !hidden.has(x.id)); }
export function hideBuiltin(id, hide) { const h = new Set(S.settings.mascotHidden || []); if (hide) h.add(id); else h.delete(id); S.settings.mascotHidden = [...h]; save(); }
// everything that can appear
export function allImages() { return [...builtinImages(), ...loadImages()]; }
export function saveImages(list) { try { localStorage.setItem(IMG_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }

// Cut-out: flood-fill from the edges, removing anything close to the border colour, so a plain/white background
// goes transparent and the figure stands alone. Tolerance is generous; a 1px feather softens the edge.
export function cutout(c) {
  const ctx = c.getContext("2d"), W = c.width, H = c.height;
  const im = ctx.getImageData(0, 0, W, H), d = im.data;
  const seeds = [];
  for (let x = 0; x < W; x += 4) { seeds.push(x, 0, x, H - 1); }
  for (let y = 0; y < H; y += 4) { seeds.push(0, y, W - 1, y); }
  // reference colour: median-ish of the border samples
  const samp = []; for (let i = 0; i < seeds.length; i += 2) { const p = (seeds[i + 1] * W + seeds[i]) * 4; samp.push([d[p], d[p + 1], d[p + 2]]); }
  samp.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  const ref = samp[Math.floor(samp.length / 2)];
  const tol = 48;
  const close = (p) => { const dr = d[p] - ref[0], dg = d[p + 1] - ref[1], db = d[p + 2] - ref[2]; return Math.sqrt(dr * dr + dg * dg + db * db) < tol; };
  const mask = new Uint8Array(W * H); // 1 = background
  const stack = [];
  for (let i = 0; i < seeds.length; i += 2) { const x = seeds[i], y = seeds[i + 1]; const k = y * W + x; if (!mask[k] && close(k * 4)) { mask[k] = 1; stack.push(k); } }
  while (stack.length) {
    const k = stack.pop(); const x = k % W, y = (k - x) / W;
    const nb = [k - 1, k + 1, k - W, k + W];
    for (let j = 0; j < 4; j++) { const n = nb[j]; if (n < 0 || n >= W * H) continue; if (j === 0 && x === 0) continue; if (j === 1 && x === W - 1) continue; if (!mask[n] && close(n * 4)) { mask[n] = 1; stack.push(n); } }
  }
  let bg = 0; for (let k = 0; k < W * H; k++) bg += mask[k];
  if (bg < W * H * 0.05) return false; // no plain background found: leave the picture as is
  // apply with a 1px feather
  for (let k = 0; k < W * H; k++) {
    if (mask[k]) { d[k * 4 + 3] = 0; continue; }
    const x = k % W, y = (k - x) / W;
    let edge = 0;
    if (x > 0 && mask[k - 1]) edge++; if (x < W - 1 && mask[k + 1]) edge++; if (y > 0 && mask[k - W]) edge++; if (y < H - 1 && mask[k + W]) edge++;
    if (edge) d[k * 4 + 3] = Math.round(255 * (1 - edge / 6));
  }
  ctx.putImageData(im, 0, 0);
  return true;
}

function encode(c) {
  let data = c.toDataURL("image/webp", 0.88);
  if (!data.startsWith("data:image/webp")) data = c.toDataURL("image/png");
  return data;
}

export function addImageFile(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const max = 720, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const cut = S.settings.mascotCutout !== false ? cutout(c) : false;
      const list = loadImages();
      list.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), data: encode(c), w: c.width, h: c.height, cut });
      URL.revokeObjectURL(img.src);
      res(saveImages(list) ? list : null);
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

// Re-run the cut-out on pictures already stored.
export function recutAll() {
  const list = loadImages();
  return Promise.all(list.map((it) => new Promise((res) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; c.getContext("2d").drawImage(img, 0, 0); it.cut = cutout(c); if (it.cut) it.data = encode(c); res(); };
    img.onerror = () => res();
    img.src = it.data;
  }))).then(() => { saveImages(list); return list.filter((x) => x.cut).length; });
}

// ---- the built-in character: the brand tube with a face ----------------------------------------------------
// A diagonal neon tube (pink → cyan → lime, like the launcher icon) with two eyes and a mouth. Not a person.
const INK = "#0b0716";
const eye = (cx, cy, open = 1, look = 0) => open >= 1
  ? `<circle cx="${cx}" cy="${cy}" r="6" fill="#fff"/><circle cx="${cx + look}" cy="${cy + 0.5}" r="3.4" fill="${INK}"/><circle cx="${cx + look + 1.2}" cy="${cy - 1}" r="1.1" fill="#fff"/>`
  : `<path d="M${cx - 6} ${cy + 1} q6 -${8 * open} 12 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
// Simple shapes only: circles, arcs, polygons. Extra faces (wink, star, shades, smug, sparkle) are cosmetics
// unlocked by progress (js/cosmetics.js); the stick stays an abstract tube with a face, never a figure.
const star5 = (cx, cy, r) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push((cx + rr * Math.cos(a)).toFixed(1) + "," + (cy + rr * Math.sin(a)).toFixed(1)); } return pts.join(" "); };
const sparkle4 = (cx, cy, r) => `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} z`;
const smile = (x, y) => `<path d="M${x - 9} ${y + 9} q9 11 18 0 z" fill="${INK}"/>`;
const FACES = {
  idle:   { eyes: (x, y) => eye(x - 10, y) + eye(x + 10, y), mouth: (x, y) => `<path d="M${x - 6} ${y + 12} q6 4 12 0" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  happy:  { eyes: (x, y) => eye(x - 10, y, 0.7) + eye(x + 10, y, 0.7), mouth: smile },
  alert:  { eyes: (x, y) => eye(x - 10, y, 1, 1.5) + eye(x + 10, y, 1, 1.5), mouth: (x, y) => `<ellipse cx="${x}" cy="${y + 13}" rx="3.6" ry="4.6" fill="${INK}"/>` },
  sleepy: { eyes: (x, y) => `<path d="M${x - 16} ${y} h12 M${x + 4} ${y} h12" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/>`, mouth: (x, y) => `<path d="M${x - 5} ${y + 12} h10" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` },
  // cosmetic faces
  wink:   { eyes: (x, y) => eye(x - 10, y) + eye(x + 10, y, 0.4), mouth: (x, y) => `<path d="M${x - 7} ${y + 11} q8 6 15 -2" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  star:   { eyes: (x, y) => `<polygon points="${star5(x - 10, y, 8)}" fill="#fff6a8" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><polygon points="${star5(x + 10, y, 8)}" fill="#fff6a8" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`, mouth: smile },
  shades: { eyes: (x, y) => `<rect x="${x - 19}" y="${y - 6}" width="16" height="12" rx="4" fill="${INK}"/><rect x="${x + 3}" y="${y - 6}" width="16" height="12" rx="4" fill="${INK}"/><path d="M${x - 3} ${y - 2} h6" stroke="${INK}" stroke-width="2.5"/><path d="M${x - 16} ${y - 3} h6 M${x + 6} ${y - 3} h6" stroke="#fff" stroke-width="1.6" opacity=".7" stroke-linecap="round"/>`, mouth: (x, y) => `<path d="M${x - 5} ${y + 12} q5 3 11 -1" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  smug:   { eyes: (x, y) => eye(x - 10, y, 1, 1.8) + eye(x + 10, y, 1, 1.8) + `<path d="M${x - 16} ${y - 1} q6 -3 12 0 M${x + 4} ${y - 1} q6 -3 12 0" stroke="${INK}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`, mouth: (x, y) => `<path d="M${x - 8} ${y + 12} q9 5 15 -3" stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"/>` },
  sparkle: { eyes: (x, y) => `<path d="${sparkle4(x - 10, y, 9)}" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="${sparkle4(x + 10, y, 9)}" fill="#fff" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="${sparkle4(x - 2, y - 8, 3)}" fill="#fff"/><path d="${sparkle4(x + 18, y + 8, 3)}" fill="#fff"/>`, mouth: smile },
};
// Accessories sit on the face's local axes (x across the tube, -y toward the tube's top end).
const ACCESSORIES = {
  none: () => "",
  bow: (x, y) => `<path d="M${x - 20} ${y - 33} l-14 -9 q-3 9 0 18 z M${x - 20} ${y - 33} l14 -9 q3 9 0 18 z" fill="#ff2fd2" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/><path d="M${x - 20} ${y - 33} l-5 12 M${x - 20} ${y - 33} l5 12" stroke="#ff2fd2" stroke-width="3" stroke-linecap="round"/><circle cx="${x - 20}" cy="${y - 33}" r="3.4" fill="#ffb3ec" stroke="${INK}" stroke-width="1.6"/>`
    + `<path d="M${x - 15} ${y - 7} l-3 -5 M${x - 10} ${y - 8} l0 -6 M${x - 5} ${y - 7} l3 -5 M${x + 5} ${y - 7} l-3 -5 M${x + 10} ${y - 8} l0 -6 M${x + 15} ${y - 7} l3 -5" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  cap: (x, y) => `<path d="M${x - 20} ${y - 26} a20 14 0 0 1 40 0 z" fill="#21f0ff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><path d="M${x - 22} ${y - 26} h44" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M${x + 8} ${y - 27} q22 -3 26 6 q-14 -2 -26 3 z" fill="#21f0ff" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="${x}" cy="${y - 41}" r="2.4" fill="${INK}"/>`,
  headphones: (x, y) => `<path d="M${x - 24} ${y + 2} v-16 a24 24 0 0 1 48 0 v16" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/><rect x="${x - 30}" y="${y - 6}" width="10" height="18" rx="5" fill="#c3ff3d" stroke="${INK}" stroke-width="1.8"/><rect x="${x + 20}" y="${y - 6}" width="10" height="18" rx="5" fill="#c3ff3d" stroke="${INK}" stroke-width="1.8"/>`,
  halo: (x, y) => `<ellipse cx="${x}" cy="${y - 50}" rx="17" ry="5.5" fill="none" stroke="#ffd54a" stroke-width="3.5"/><ellipse cx="${x}" cy="${y - 50}" rx="17" ry="5.5" fill="none" stroke="#fff6a8" stroke-width="1.2" opacity=".8"/>`,
  crown: (x, y) => `<path d="M${x - 16} ${y - 30} l0 -18 l8 8 l8 -14 l8 14 l8 -8 l0 18 z" fill="#ffd54a" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="${x - 8}" cy="${y - 34}" r="1.8" fill="#ff2fd2"/><circle cx="${x}" cy="${y - 34}" r="1.8" fill="#21f0ff"/><circle cx="${x + 8}" cy="${y - 34}" r="1.8" fill="#c3ff3d"/>`,
};
export const FACE_IDS = Object.keys(FACES);
export const ACCESSORY_IDS = Object.keys(ACCESSORIES);
const BRAND_TUBE = ["#ff2fd2", "#21f0ff", "#c3ff3d"];
// stickSVG(face, aura, size, opts): opts.accessory = accessory id, opts.color = colour cosmetic id (gold/sunset
// swap the tube gradient), opts.tube = explicit gradient stops.
export function stickSVG(face = "idle", aura = AURA.pink, size = 140, opts = {}) {
  const f = FACES[face] || FACES.idle;
  const acc = ACCESSORIES[opts.accessory] || ACCESSORIES.none;
  const tube = opts.tube || (opts.color && findCosmetic("color", opts.color)?.tube) || BRAND_TUBE;
  const id = "gs" + Math.random().toString(36).slice(2, 7);
  // tube from lower-left to upper-right; the face sits on the upper third (the "head" end)
  const x0 = 36, y0 = 106, x1 = 104, y1 = 34, th = 40;
  const fx = 86, fy = 50; // face centre along the tube near the top end
  const ang = Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI + 90; // face rotation so eyes sit across the tube
  const stops = tube.map((c, i) => `<stop offset="${(i / Math.max(1, tube.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join("");
  return `<svg class="stick" viewBox="0 0 140 140" width="${size}" height="${size}" aria-hidden="true">
  <defs>
    <linearGradient id="${id}g" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" gradientUnits="userSpaceOnUse">${stops}</linearGradient>
    <filter id="${id}f" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${aura}" stroke-width="${th + 12}" stroke-linecap="round" opacity=".45" filter="url(#${id}f)"/>
  <line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="url(#${id}g)" stroke-width="${th}" stroke-linecap="round"/>
  <line x1="${x0 - 4}" y1="${y0 - 5}" x2="${x1 - 4}" y2="${y1 - 5}" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".35"/>
  <g transform="rotate(${ang.toFixed(1)} ${fx} ${fy})"><g class="face" transform="translate(0 -4)">${f.eyes(fx, fy)}${f.mouth(fx, fy)}</g><g class="acc" transform="translate(0 -4)">${acc(fx, fy)}</g></g>
</svg>`;
}

// ---- show it -------------------------------------------------------------------------------------------------
// peek(state, opts): opts.line overrides the text, opts.ms the duration, opts.face the stick's expression,
// opts.image forces the built-in stick even when pictures exist.
// Equipped cosmetics (js/cosmetics.js) are applied here: the colour's aura wins over the state's unless the
// state is a warning (error/billSoon/overspend keep their own); the bubble skin and a fixed motion apply to
// pictures and the stick alike; face and accessory only to the stick, and the state's alert/sleepy face wins.
const STATE_AURA_WINS = new Set(["error", "billSoon", "overspend"]);
const STATE_FACE_WINS = new Set(["alert", "sleepy"]);
export function styleFor(st) {
  const c = equippedItems();
  const aura = (!STATE_AURA_WINS.has(st.key) && c.color?.aura) ? c.color.aura : st.aura;
  const motion = c.motion && c.motion.id !== "surprise" ? c.motion.id : st.motion;
  const face = (STATE_FACE_WINS.has(st.face) || !c.face || c.face.id === "classic") ? st.face : c.face.id;
  return { aura, motion, face, accessory: c.accessory?.id || "none", color: c.color?.id || "violet", bubble: c.bubble?.id || "white" };
}
export function peek(kind = "success", opts = {}) {
  if (S.settings.mascot === false) return;
  if (typeof document === "undefined") return;
  const st = stateFor(kind);
  const sty = styleFor(st);
  const imgs = opts.image === "stick" ? [] : allImages();
  const pool = (PERSONAL_LINES[st.key] && imgs.length) ? PERSONAL_LINES[st.key] : st.lines;
  const line = opts.line || pool[Math.floor(Math.random() * pool.length)];
  document.querySelector("body > .mascot")?.remove();
  const el = document.createElement("div");
  el.className = "mascot m-" + (opts.motion || sty.motion) + " s-" + st.key + " b-" + sty.bubble + (imgs.length ? "" : " builtin");
  el.style.setProperty("--aura", sty.aura);
  let pic;
  if (imgs.length) { const p = imgs[Math.floor(Math.random() * imgs.length)]; pic = `<img src="${p.data}" alt="">`; }
  else pic = stickSVG(opts.face || sty.face, sty.aura, 140, { accessory: sty.accessory, color: sty.color });
  el.innerHTML = `<div class="bubble">${escapeHtml(line)}</div><div class="figure">${pic}</div>`;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add("in"));
  const ms = opts.ms || st.ms || 2800;
  setTimeout(() => el.classList.remove("in"), ms);
  setTimeout(() => el.remove(), ms + 700);
  return el;
}
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
