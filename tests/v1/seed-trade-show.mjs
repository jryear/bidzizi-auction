#!/usr/bin/env node
// Seeds a realistic 40-item Saturn trade show through the same endpoints the Items workspace uses (batch add, bulk
// photo, categories). LIVE=1 also publishes it, adds bidders and bids, and two late items that start hidden.
//   BASE=http://127.0.0.1:3420 HOST_EMAIL=... HOST_PASSWORD=... [LIVE=1] node tests/v1/seed-trade-show.mjs
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const BASE = process.env.BASE ?? "http://127.0.0.1:3420", LIVE = process.env.LIVE === "1";
const iso = ms => new Date(Date.now() + ms).toISOString();
function client() {
  const jar = new Map();
  return async (method, path, body, type = "application/json") => {
    const headers = { origin: BASE, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") };
    if (body !== undefined) headers["content-type"] = type;
    const r = await fetch(BASE + path, { method, headers, body: body === undefined ? undefined : type === "application/json" ? JSON.stringify(body) : body });
    for (const set of r.headers.getSetCookie()) { const [pair] = set.split(";"); const [k, ...v] = pair.split("="); jar.set(k, v.join("=")); }
    const data = (r.headers.get("content-type") ?? "").includes("json") ? await r.json() : null;
    if (r.status >= 300) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(data)}`);
    return data;
  };
}
const staff = client();
await staff("POST", "/api/v1/host/login", { email: process.env.HOST_EMAIL, password: process.env.HOST_PASSWORD });

// [title, short, starting $, category, provided by, photo source or null, crop variant]
const ROWS = [
  ["Weekend cabin in Big Bear", "Two nights for four, hot tub included", 400, "Travel & stays", "Pine Ridge Rentals", "cabin", 0],
  ["Ojai farmhouse retreat", "Three nights, orchard views, sleeps six", 650, "Travel & stays", "Topa Farm Stays", "cabin", 1],
  ["Palm Springs pool weekend", "Two nights at a mid-century boutique hotel", 450, "Travel & stays", "The Saguaro Club", "cabin", 2],
  ["Catalina day trip for two", "Ferry, golf cart and lunch on the island", 220, "Travel & stays", "Harbor Lines", null, 0],
  ["Chef's table dinner for six", "Seven courses with wine pairing", 300, "Dining", "Marrow & Vine", "dinner", 0],
  ["Omakase for two", "Eighteen courses at the counter", 260, "Dining", "Kaito Sushi", "dinner", 1],
  ["Private pasta class for eight", "Make, eat, take home the recipes", 380, "Dining", "Nonna's Table", "dinner", 2],
  ["Brunch for ten, delivered", "Pastries, frittatas, fruit, coffee service", 180, "Dining", "Sunny Side Catering", null, 0],
  ["Coffee for a year", "One bag of single-origin beans every month", 150, "Food & drink", "Harbor Roasters", "coffee", 0],
  ["Office espresso bar, one month", "Machine, beans and a barista visit", 500, "Food & drink", "Harbor Roasters", "coffee", 1],
  ["Natural wine club, six months", "Three bottles a month with tasting notes", 240, "Food & drink", "Cellar Nine", "coffee", 2],
  ["Craft beer tasting for twelve", "Brewery tour, flights and snacks", 200, "Food & drink", "Arroyo Brewing", null, 0],
  ["Holiday cookie tower", "Six dozen decorated cookies for your team", 90, "Food & drink", "Sugar & Sparrow", null, 0],
  ["Restored city bicycle", "Steel frame, new drivetrain, ready to ride", 250, "Wellness", "Spoke & Chain", "bicycle", 0],
  ["Ten-class yoga pass", "Any class, any studio, valid for a year", 150, "Wellness", "Blue Lotus Yoga", "flowers", 1],
  ["Massage and sauna day", "Ninety-minute massage plus full-day spa access", 210, "Wellness", "Stillwater Spa", "flowers", 2],
  ["Personal training, six sessions", "Assessment, plan and six one-hour sessions", 360, "Wellness", "Forge Athletics", "bicycle", 1],
  ["Golf for four at Brookside", "Eighteen holes with carts and lunch", 420, "Experiences", "Brookside Golf Club", "bicycle", 2],
  ["Dodgers suite for the night", "Twelve seats, food and parking", 1500, "Experiences", "Saturn Members Fund", null, 0],
  ["Sunset sail for six", "Two hours from Marina del Rey with drinks", 550, "Experiences", "Blue Tack Charters", null, 0],
  ["Hot air balloon for two", "Sunrise flight over Temecula wine country", 480, "Experiences", "Lift Off Ballooning", null, 0],
  ["Pottery wheel workshop for four", "Two sessions, firing and glazing included", 160, "Experiences", "Clay Studio", "ceramics", 1],
  ["Hand-thrown dinnerware set", "Twelve pieces, glazed in sea green", 120, "Home & design", "Clay Studio", "ceramics", 0],
  ["Fresh flowers monthly", "Six months of seasonal arrangements", 90, "Home & design", "Petal & Stem", "flowers", 0],
  ["Interior design consult", "Two-hour visit and a written room plan", 300, "Home & design", "Studio Wren", "ceramics", 2],
  ["Custom walnut desk", "Built to your measurements, delivered", 900, "Home & design", "Grain & Bench", null, 0],
  ["Smart home starter install", "Lighting, locks and a hub, installed", 350, "Tech", "Brightwire", null, 0],
  ["Laptop refresh for a small team", "Five laptops set up and data moved", 750, "Tech", "Northpoint IT", null, 0],
  ["Cybersecurity check-up", "Audit, report and a staff phishing drill", 600, "Tech", "Northpoint IT", null, 0],
  ["Website refresh for a small business", "Five pages, copy edit, launch support", 1200, "Services", "Lumen Collective", null, 0],
  ["Full-day brand photography session with retouched images and a printed lookbook", "Studio or on location, anywhere in LA County", 600, "Services", "Lumen Collective", "dinner", 3],
  ["Bookkeeping, one quarter", "Monthly close and a quarterly review", 450, "Services", "Ledgerly", null, 0],
  ["Legal check-up for your business", "Contracts, entity and IP review", 500, "Services", "Okafor & Lee LLP", null, 0],
  ["Leadership coaching, three sessions", "For a manager or founder", 400, "Services", "Clearpath Coaching", null, 0],
  ["Office deep clean", "Up to 3,000 square feet, after hours", 280, "Services", "Sparkline Cleaning", null, 0],
  ["Billboard week on Colorado Blvd", "Digital board, one week, design help", 1000, "Marketing", "Pasadena Outdoor", null, 0],
  ["Podcast guest spot and ad read", "Episode feature on Main Street Minutes", 250, "Marketing", "Main Street Minutes", null, 0],
  ["Trade show booth upgrade, 2027", "Corner booth at next year's show", 800, "Marketing", "Saturn", null, 0],
  ["$250 dining gift card", "Good at any of four Old Town restaurants", 150, "Gift cards", "Old Town Dining Group", null, 0],
  ["Mystery member box", "Twelve small gifts from twelve member businesses", 100, "Gift cards", "Saturn", null, 0],
];

const ev = await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), template: "blank", name: LIVE ? "Holiday Trade Show" : "Holiday Trade Show 2026", startsAt: iso(LIVE ? -30 * 60_000 : 2 * 86_400_000), endsAt: iso(LIVE ? 3 * 3600_000 : 2 * 86_400_000 + 4 * 3600_000), timezone: "America/Los_Angeles" });
const id = ev.id;
let w = await staff("GET", `/api/v1/host/events/${id}`);
for (const it of w.items) await staff("DELETE", `/api/v1/host/items/${it.id}`);
await staff("PATCH", `/api/v1/host/events/${id}`, { revision: w.event.revision, venue: "Saturn Hall, Pasadena", welcome: "Welcome to the Holiday Trade Show! Every item was donated by a Saturn member business. Bid from your phone; we'll tell you the moment you're outbid.", winnerInstructions: "Congratulations! Pick up your item at the Saturn desk before 8 PM, or we'll arrange delivery next week." });

const created = await staff("POST", `/api/v1/host/events/${id}/items/batch`, { requestId: randomUUID(), items: ROWS.map(([title, short, dollars, category, donor]) => ({ title, short, openingMinor: dollars * 100, category, donor,
  description: `${short}. Generously provided by ${donor}.\n\nRedeem within 12 months; some dates excluded. The provider will contact the winner within a week of the show.` })) });
for (const name of ["Travel & stays", "Dining", "Food & drink", "Experiences", "Wellness", "Home & design", "Tech", "Services", "Marketing", "Gift cards"]) await staff("POST", `/api/v1/host/events/${id}/categories`, { action: "add", name });
await staff("POST", `/api/v1/host/events/${id}/categories`, { action: "order", names: ["Travel & stays", "Dining", "Food & drink", "Experiences", "Wellness", "Home & design", "Tech", "Services", "Marketing", "Gift cards"] });

// Photos: each source in a few distinct crops and tones, so the catalog doesn't look like six images on repeat.
const VARIANTS = [{ left: 0, top: 0, scale: 1, hue: 0 }, { left: .18, top: .1, scale: .72, hue: 18 }, { left: .05, top: .25, scale: .7, hue: -16 }, { left: .3, top: .05, scale: .65, hue: 30 }];
const changes = [];
for (const [n, row] of ROWS.entries()) {
  const [, , , , , source, variant] = row;
  if (!source) continue;
  const raw = await readFile(`prototypes/lanyard/assets/lots/${source}.jpg`), meta = await sharp(raw).metadata(), v = VARIANTS[variant];
  const width = Math.round(meta.width * v.scale), height = Math.round(meta.height * v.scale);
  const jpeg = await sharp(raw).extract({ left: Math.round((meta.width - width) * Math.min(1, v.left * 2)), top: Math.round((meta.height - height) * Math.min(1, v.top * 2)), width, height })
    .modulate({ hue: v.hue, saturation: 1 + v.hue / 200 }).jpeg({ quality: 84 }).toBuffer();
  const asset = await staff("POST", "/api/v1/host/assets", jpeg, "image/jpeg");
  changes.push({ id: created.ids[n], imageAssetId: asset.id });
}
await staff("PATCH", `/api/v1/host/events/${id}/items`, { changes });
const cover = await staff("POST", "/api/v1/host/assets", await readFile("prototypes/lanyard/assets/lots/dinner.jpg"), "image/jpeg");
w = await staff("GET", `/api/v1/host/events/${id}`);
await staff("PATCH", `/api/v1/host/events/${id}`, { revision: w.event.revision, coverAssetId: cover.id });

if (LIVE) {
  w = await staff("GET", `/api/v1/host/events/${id}`);
  await staff("PATCH", `/api/v1/host/events/${id}`, { revision: w.event.revision, status: "live" });
  w = await staff("GET", `/api/v1/host/events/${id}`);
  const people = [["Alice Chen", "Juniper Design"], ["Ben Ortiz", "Harbor LLC"], ["Cara Singh", "Cedar Dental"], ["Dev Patel", "Northpoint IT"]].map(([n, b]) => ({ c: client(), n, b }));
  for (const p of people) await p.c("POST", `/api/v1/e/${w.event.code}/join`, { requestId: randomUUID(), displayName: p.n, businessName: p.b });
  for (const [k, item] of w.items.slice(0, 14).entries()) {
    let amount = item.openingMinor;
    for (let round = 0; round < 1 + (k % 3); round++) {
      const p = people[(k + round) % people.length];
      const r = await p.c("POST", `/api/v1/e/${w.event.code}/bid`, { requestId: randomUUID(), itemId: item.id, amountMinor: amount });
      amount = r.receipt.minimumNextMinor;
    }
  }
  // Two items arrive after the show is published: they start hidden until staff show them.
  for (const [title, dollars, category, donor] of [["Late donation: e-bike tune-up", 80, "Wellness", "Spoke & Chain"], ["Late donation: team lunch for 15", 220, "Dining", "Sunny Side Catering"]])
    await staff("POST", `/api/v1/host/events/${id}/items`, { requestId: randomUUID(), title, openingMinor: dollars * 100, category, donor });
}
w = await staff("GET", `/api/v1/host/events/${id}`);
console.log(JSON.stringify({ eventId: id, code: w.event.code, items: w.items.length, hidden: w.items.filter(i => !i.ready).length, withPhotos: w.items.filter(i => i.imageUrl).length, categories: w.event.categories }));
