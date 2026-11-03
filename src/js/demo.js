// Fictional finances only. Never merge demonstration records with a user's finances.
import { blank, toISO } from "./state.js";
export function canLoadDemo(s) {
  return !s.settings.demo && !s.settings.income && !s.tx.length && !s.bills.length && !s.goals.length && !s.loans.length && !s.rules.length && !s.pending.length && !s.urges.length;
}
export function demoState(now = new Date()) {
  const s = blank();
  // Override personal defaults as well: no demo contacts or automatic capture/sending.
  s.settings.notify = { name: "", phone: "", onEarn: false, onRedeem: false, auto: false };
  Object.assign(s.settings, { demo: true, seenIntro: true, income: 3200, incomeEntered: 3200, incomeFreq: "monthly", haptics: false });
  s.settings.sources.notif = false;
  const add = (monthOffset, day, desc, amount, cat) => {
    if (monthOffset === 0 && day > now.getDate()) return;
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, day);
    const id = "demo-" + (s.tx.length + 1);
    s.tx.push({ id, date: toISO(d), desc, amount, cat, src: "demo", hash: id });
  };
  for (const m of [-3, -2, -1, 0]) {
    add(m, 1, "Example paycheck", 3200, "income");
    for (const [day, desc, amount, cat] of [[1,"Example rent",1050,"housing"],[2,"Example utilities",140,"utilities"],[3,"Example groceries",285,"groceries"],[4,"Example transport",120,"transport"],[5,"Example health",80,"health"],[6,"Example eating out",150,"eating"],[7,"Example gaming",45,"gaming"],[8,"Example shopping",65,"shopping"],[9,"Example subscriptions",25,"subs"],[10,"Example loan payment",160,"loans"]]) add(m, day, desc, -amount, cat);
  }
  s.bills = [{ id: "demo-bill", name: "Example rent", amount: 1050, day: 1, cat: "housing", autopay: false, paid: { [toISO(now).slice(0,7)]: "demo-35" } }];
  s.goals = [{ id: "demo-goal", name: "Emergency fund (example)", target: 1500, saved: 450, monthly: 150, due: null, created: toISO(new Date(now.getFullYear(), now.getMonth()-3, 1)), log: [{ date: toISO(now), amt: 450 }], milestones: { 25: true } }];
  return s;
}
