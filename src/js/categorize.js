// Guess a category from a transaction description. User rules win over the built-in keyword table.
import { S, save } from "./state.js";

const KEYWORDS = [
  ["groceries", ["walmart", "kroger", "aldi", "heb", "h-e-b", "safeway", "publix", "costco", "sam's club", "sams club", "trader joe", "whole foods", "grocery", "market", "food lion", "meijer", "winco", "wegmans", "sprouts", "dollar general", "family dollar"]],
  ["eating", ["mcdonald", "burger", "taco", "chipotle", "starbucks", "dunkin", "pizza", "domino", "wendy", "chick-fil", "subway", "sonic", "whataburger", "doordash", "uber eats", "ubereats", "grubhub", "restaurant", "cafe", "coffee", "diner", "grill", "kitchen", "bbq", "wing", "panda express", "popeyes", "kfc", "arby", "jack in the box", "waffle house", "ihop", "denny"]],
  ["transport", ["shell", "exxon", "chevron", "bp ", "texaco", "valero", "citgo", "marathon", "sunoco", "speedway", "wawa", "qt ", "quiktrip", "buc-ee", "gas", "fuel", "uber", "lyft", "parking", "toll", "auto parts", "autozone", "o'reilly", "jiffy lube", "car wash", "dmv"]],
  ["housing", ["rent", "mortgage", "landlord", "apartment", "property", "lease", "hoa"]],
  ["utilities", ["electric", "power", "energy", "water", "gas co", "utility", "t-mobile", "tmobile", "verizon", "at&t", "att ", "sprint", "spectrum", "comcast", "xfinity", "internet", "cox ", "frontier", "metro pcs", "cricket", "mint mobile", "visible"]],
  ["subs", ["netflix", "spotify", "hulu", "disney", "hbo", "max ", "youtube", "apple.com/bill", "apple bill", "google play", "google *", "amazon prime", "prime video", "paramount", "peacock", "crunchyroll", "patreon", "onlyfans", "audible", "kindle", "icloud", "dropbox", "adobe", "microsoft", "openai", "chatgpt", "claude", "anthropic", "gym", "planet fitness", "la fitness", "membership"]],
  ["health", ["pharmacy", "cvs", "walgreens", "rite aid", "clinic", "doctor", "dental", "dentist", "hospital", "medical", "urgent care", "optical", "vision", "therapy", "copay", "rx"]],
  ["gaming", ["steam", "xbox", "playstation", "sony interactive", "nintendo", "epic games", "riot", "blizzard", "ea *", "electronic arts", "ubisoft", "roblox", "twitch", "discord", "gamestop", "g2a", "humble", "gog.com", "battle.net", "supercell", "king.com", "candy crush", "fortnite", "minecraft", "genshin", "hoyoverse", "microsoft*xbox", "google *", "apple.com/bill"]],
  ["shopping", ["amazon", "amzn", "target", "best buy", "ebay", "etsy", "temu", "shein", "home depot", "lowe's", "lowes", "ikea", "wayfair", "old navy", "gap", "nike", "adidas", "ross", "tj maxx", "marshalls", "kohl", "macy", "nordstrom", "shop", "store", "walmart.com", "five below", "hobby lobby", "michaels", "petsmart", "petco", "chewy"]],
  ["fun", ["cinema", "theater", "theatre", "amc ", "regal", "concert", "ticketmaster", "eventbrite", "bar ", "pub ", "brewery", "tavern", "lounge", "club", "casino", "bowling", "arcade", "dave & buster", "topgolf", "zoo", "museum", "park", "game", "hobby", "liquor", "wine", "spirits", "smoke", "vape"]],
  ["loans", ["loan", "auto pay", "autopay", "finance", "financial", "capital one auto", "ally", "toyota financial", "honda financial", "ford credit", "gm financial", "nissan motor", "santander", "credit acceptance", "affirm", "klarna", "afterpay", "navient", "nelnet", "sallie", "student"]],
  ["savings", ["transfer to savings", "savings", "to sav", "vanguard", "fidelity", "schwab", "robinhood", "acorns", "betterment", "wealthfront"]],
  ["income", ["payroll", "direct dep", "direct deposit", "salary", "paycheck", "deposit", "refund", "reimburse", "venmo from", "zelle from", "cash app from", "interest paid", "irs treas", "ssa treas", "unemployment"]],
];

export function guessCategory(desc, amount) {
  const d = String(desc || "").toLowerCase();
  for (const r of S.rules) if (r.match && d.includes(r.match.toLowerCase())) return r.cat;
  if (amount > 0) return "income"; // money in is income unless a rule says otherwise
  for (const [cat, words] of KEYWORDS) {
    if (cat === "income") continue;
    for (const w of words) if (d.includes(w)) return cat;
  }
  return amount > 0 ? "income" : "other";
}

// Turn "SQ *BLUE BOTTLE COFFEE 0412 SAN FRANC" into "blue bottle coffee": the part a rule should match on.
export function merchantKey(desc) {
  let d = String(desc || "").toLowerCase();
  d = d.replace(/\b(pos|debit|credit|purchase|card|payment|checkcard|visa|mastercard|ach|withdrawal|recurring|online|tst\*|sq \*|sq\*|pp\*|paypal \*|dd \*)\b/g, " ");
  d = d.replace(/[#*]\s*\w+/g, " ").replace(/\b\d{2,}\b/g, " ").replace(/[^a-z&'.\- ]/g, " ").replace(/\s+/g, " ").trim();
  const words = d.split(" ").filter((w) => w.length > 1);
  return words.slice(0, 3).join(" ");
}

export function addRule(match, catId) {
  match = String(match || "").trim().toLowerCase();
  if (!match) return;
  S.rules = S.rules.filter((r) => r.match !== match);
  S.rules.unshift({ match, cat: catId });
  save();
}

export function applyRulesTo(txs) {
  let n = 0;
  for (const t of txs) {
    const d = t.desc.toLowerCase();
    const r = S.rules.find((x) => d.includes(x.match));
    if (r && t.cat !== r.cat) { t.cat = r.cat; n++; }
  }
  return n;
}
