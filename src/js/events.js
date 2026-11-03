// Tiny event bus shared by the game layer, coupons, notify and the UI.
const listeners = [];
export function onEvent(fn) { listeners.push(fn); }
export function emit(ev) { for (const fn of listeners) { try { fn(ev); } catch (e) { console.warn("listener failed", e); } } }
