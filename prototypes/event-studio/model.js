import { lots as fixtures } from "../lanyard/src/fixtures.shared.js";
export const KEY = "bidzizi.event-studio.workspace.v1";
export const uid = () => crypto.randomUUID();
export const money = (cents) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  })
    .format(cents / 100)
    .replace(/\.00$/, "");
export const emptyEvent = (name, id = uid()) => ({
  id,
  name,
  heading: "",
  welcome: "",
  date: "",
  location: "",
  timezone: "America/Los_Angeles",
  categories: [],
  windows: [],
  lots: [],
  sponsors: [],
  sms: { sender: false, consent: false, test: "untested" },
  donation: { enabled: false, description: "" },
  display: {
    draft: {
      title: name,
      layout: "grid",
      footer: "Welcome to the auction",
      showAmounts: true,
    },
    applied: null,
  },
  review: null,
  revision: 0,
});
function seed() {
  const a = emptyEvent("Holiday Trade Show", "holiday");
  Object.assign(a, {
    heading: "dinner",
    welcome:
      "Good company. Great discoveries. Join Northline Business Exchange for an evening of local finds, shared tables, and a little friendly bidding.",
    date: "2026-12-12T17:00",
    location: "Northline Hall · Portland",
    categories: ["Getaways", "For the team", "Food & drink", "Good things"],
    windows: [
      {
        id: "early",
        name: "Early evening",
        start: "2026-12-12T17:00",
        end: "2026-12-12T18:00",
      },
      {
        id: "final",
        name: "Evening finale",
        start: "2026-12-12T18:15",
        end: "2026-12-12T19:00",
      },
    ],
    sponsors: ["Cedar & Pine Retreats", "Soft Earth Studio"],
  });
  a.lots = fixtures.map((l, i) => ({
    id: uid(),
    title: l.title,
    description: l.description,
    image: l.image,
    category: l.category,
    window: i < 3 ? "early" : i < 5 ? "final" : "",
    opening: 10000 + i * 2500,
    increment: 2500,
    source: l.sponsor,
    logo: l.logo,
  }));
  a.lots.push({
    id: uid(),
    title: "A private studio workshop for your team",
    description: "",
    image: "",
    category: "",
    window: "",
    opening: 10000,
    increment: 2500,
    source: "Northline Business Exchange",
    logo: "earth",
  });
  const b = emptyEvent("Spring Market Social", "spring");
  Object.assign(b, {
    heading: "flowers",
    welcome:
      "A fresh season of local makers. Meet the people behind the work at our spring gathering.",
    date: "2027-04-23T16:00",
    location: "Riverside Pavilion",
    categories: ["Local makers"],
    windows: [
      {
        id: "spring-window",
        name: "Market auction",
        start: "2027-04-23T16:00",
        end: "2027-04-23T18:00",
      },
    ],
  });
  b.lots = fixtures
    .slice(3)
    .map((l) => ({
      id: uid(),
      title: l.title,
      description: l.description,
      image: l.image,
      category: "Local makers",
      window: "spring-window",
      opening: 7500,
      increment: 2500,
      source: l.sponsor,
      logo: l.logo,
    }));
  return {
    version: 1,
    events: [a, b],
    drafts: {},
    ui: { active: "holiday", filters: {}, selection: {} },
  };
}
export let db;
try {
  const parsed = JSON.parse(localStorage.getItem(KEY));
  db = parsed?.version === 1 && Array.isArray(parsed.events) ? parsed : seed();
} catch {
  db = seed();
}
export function persist() {
  localStorage.setItem(KEY, JSON.stringify(db));
}
export function transact(fn) {
  const previous = structuredClone(db);
  try {
    fn(db);
    persist();
    return true;
  } catch {
    db = previous;
    return false;
  }
}
export const eventById = (id) => db.events.find((e) => e.id === id);
export const validWindow = (w) =>
  Boolean(w.name.trim() && w.start && w.end && w.end > w.start);
export const lotIssues = (e, l) =>
  [
    !l.title.trim() ? "Title missing" : "",
    !l.description.trim() ? "Description missing" : "",
    !l.image ? "Image missing" : "",
    !l.category ? "Category missing" : "",
    !e.windows.some((w) => w.id === l.window && validWindow(w))
      ? "Window missing"
      : "",
    !Number.isSafeInteger(l.opening) || l.opening <= 0
      ? "Opening bid missing"
      : "",
    !Number.isSafeInteger(l.increment) || l.increment <= 0
      ? "Increment missing"
      : "",
  ].filter(Boolean);
export function checks(e) {
  return [
    {
      title: "Welcome & event details",
      detail: "Heading image, welcome, venue, and physical event time.",
      ok: !!(e.heading && e.welcome.trim() && e.date && e.location.trim()),
      to: "presentation",
    },
    {
      title: "Lot content",
      detail: e.lots.length
        ? `${e.lots.filter((l) => l.title && l.description && l.image).length} of ${e.lots.length} lots have a title, description, and image.`
        : "Add at least one lot.",
      ok:
        e.lots.length > 0 &&
        e.lots.every((l) => l.title && l.description && l.image),
      to: "lots",
    },
    {
      title: "Categories",
      detail: `${e.lots.filter((l) => !l.category).length} uncategorized lots. Categories organize browsing, not bidding times.`,
      ok:
        e.lots.length > 0 &&
        e.lots.every((l) => e.categories.includes(l.category)),
      to: "lots",
      filter: "uncategorized",
    },
    {
      title: "Bidding windows",
      detail: `${e.lots.filter((l) => !l.window).length} unassigned lots. Each lot uses one window in this prototype.`,
      ok:
        e.windows.length > 0 &&
        e.windows.every(validWindow) &&
        e.lots.length > 0 &&
        e.lots.every((l) =>
          e.windows.some((w) => w.id === l.window && validWindow(w)),
        ),
      to: "lots",
      filter: "unassigned",
    },
    {
      title: "Opening bids & increments",
      detail:
        "USD cents are a fixture. Each lot needs a positive opening bid and increment.",
      ok:
        e.lots.length > 0 &&
        e.lots.every(
          (l) =>
            Number.isSafeInteger(l.opening) &&
            l.opening > 0 &&
            Number.isSafeInteger(l.increment) &&
            l.increment > 0,
        ),
      to: "lots",
    },
  ];
}
export const touch = (e) => {
  e.revision++;
};
export const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Not set";
