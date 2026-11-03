// Never silently overwrite an unreadable saved record. Failures remain visible until resolved.
const blocked = new Set();
const problems = new Map();
function report(key, message) {
  if (message) problems.set(key, message); else problems.delete(key);
  if (typeof window !== "undefined" && window?.dispatchEvent) window.dispatchEvent(new Event("glowstick-storage"));
}
export function storageProblem(key) { return problems.get(key) || ""; }
export function rawSaved(key) { try { return localStorage.getItem(key); } catch { return null; } }
export function load(key, blank, validate) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid saved record");
      if (validate) validate(value);
      return value;
    }
  } catch {
    blocked.add(key);
    report(key, "Saved data could not be read. It has been preserved. Export the original and restore a valid backup before continuing.");
  }
  return blank();
}
export function persist(key, obj, replaceUnreadable = false) {
  if (blocked.has(key) && !replaceUnreadable) return false;
  try {
    localStorage.setItem(key, JSON.stringify(obj));
    blocked.delete(key); report(key, ""); return true;
  } catch {
    report(key, "Changes are not saved. Keep this app open, export a backup, then free device space or retry saving.");
    return false;
  }
}
export function exportJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function readFileText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsText(file);
  });
}
