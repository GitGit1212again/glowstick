// Tab routing. Each view exports render(root) and optionally unmount().
// Navigating replaces the #view element so old listeners and timers go away.

const views = {};
let currentTab = "home";

export function register(name, mod) { views[name] = mod; }

export function go(tab) {
  if (!views[tab]) return;
  views[currentTab]?.unmount?.();
  currentTab = tab;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  refresh();
  window.scrollTo({ top: 0 });
}

export function refresh() {
  const old = document.getElementById("view");
  const fresh = old.cloneNode(false);
  old.replaceWith(fresh);
  views[currentTab].render(fresh);
}

export function current() { return currentTab; }
