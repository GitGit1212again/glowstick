// Validate portable backups before changing either current data or persistent storage.
const object = (x) => x && typeof x === "object" && !Array.isArray(x);
const number = (x) => typeof x === "number" && Number.isFinite(x);
const text = (x) => typeof x === "string";
const date = (x) => text(x) && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x));
function check(ok, message) { if (!ok) throw new Error(message); }
export function validateBackup(value) {
  check(object(value) && value.v === 1, "Expected a version-1 Glowstick backup");
  check(object(value.settings) && object(value.game), "Backup is missing settings or game state");
  // Reject special property names at every depth; restored objects are merged with defaults.
  const inspect = (v) => {
    if (!v || typeof v !== "object") return;
    for (const [key, child] of Object.entries(v)) {
      check(!["__proto__", "prototype", "constructor"].includes(key), "Unsafe backup property"); inspect(child);
    }
  };
  inspect(value);
  for (const key of ["tx", "rules", "bills", "goals", "loans", "pending", "urges"]) {
    if (["rules", "pending", "urges"].includes(key) && value[key] === undefined) continue;
    check(Array.isArray(value[key]), "Backup is missing the " + key + " list");
    check(value[key].every(object), "Invalid " + key + " record");
  }
  if (value.categories !== undefined) check(Array.isArray(value.categories) && value.categories.every((x) => object(x) && text(x.id) && text(x.name)), "Invalid categories");
  for (const key of ["sources", "rewards", "impulse", "notify", "budgets", "pct"]) if (value.settings[key] !== undefined) check(object(value.settings[key]), "Invalid settings: " + key);
  if (value.settings.income !== undefined) check(number(value.settings.income) && value.settings.income >= 0, "Invalid income");
  if (value.game.xp !== undefined) check(number(value.game.xp) && value.game.xp >= 0, "Invalid XP");
  for (const t of value.tx) check(text(t.id) && date(t.date) && text(t.desc) && number(t.amount) && text(t.cat), "Invalid transaction");
  for (const b of value.bills) check(text(b.id) && text(b.name) && number(b.amount) && b.amount >= 0 && number(b.day) && b.day >= 1 && b.day <= 31 && object(b.paid), "Invalid bill");
  for (const g of value.goals) check(text(g.id) && text(g.name) && number(g.target) && g.target > 0 && number(g.saved) && g.saved >= 0 && number(g.monthly) && g.monthly >= 0 && Array.isArray(g.log) && object(g.milestones), "Invalid savings goal");
  for (const l of value.loans) check(text(l.id) && text(l.name) && number(l.balance) && l.balance >= 0 && number(l.apr) && l.apr >= 0 && number(l.minPayment) && l.minPayment >= 0 && Array.isArray(l.log), "Invalid loan");
  return value;
}
