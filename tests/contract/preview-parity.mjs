#!/usr/bin/env node
// Contract real-v1-preview-001, acceptance: the Studio phone preview is the real guest app,
// fed by a server-built preview snapshot. See tasks/real-v1-preview-001.toml for the frozen interface.
//
// Run only through the kernel verifier (it supplies VERIFY_*). Needs BZ_CONTRACT_PG (see lib/stack.mjs).
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chromium } from "@playwright/test";
import { harness, receipt, requireVerifyEnv, database, appServer, client, must, Infra } from "./lib/stack.mjs";

const CHECK = "studio preview is the real guest app";
const SCREENS = ["join", "items", "item", "event", "give", "mine"];
const IDS = [
  "PREVIEW_API_STAFF_ONLY", "PREVIEW_API_MATCHES_GUEST", "PREVIEW_API_ANON", "PREVIEW_API_DRAFT", "PREVIEW_API_HIDDEN_FLAGGED",
  "CANVAS_USES_SERVER_PREVIEW", ...SCREENS.map(s => `CANVAS_PARITY_${s.toUpperCase()}`), "CANVAS_HIDDEN_MARKED", "CANVAS_NO_GUEST_WRITES",
];
const PREVIEW_ME = { displayName: "A guest", businessName: "Your Business" };
const RIVAL = { displayName: "Alice Rival", businessName: "Juniper Rival Co" };
const iso = ms => new Date(Date.now() + ms).toISOString();

await harness(async onExit => {
  requireVerifyEnv();
  const r = receipt(CHECK, IDS);
  const { dbUrl, email, password } = await database(onExit);
  const otherPassword = `ct-other-${randomUUID().slice(0, 8)}`;
  try {
    execFileSync(process.execPath, ["scripts/provision-staff.mjs", "--org", "other-org", "--org-name", "Other Org", "--email", "other@example.com", "--name", "Other Host"],
      { env: { ...process.env, BIDZIZI_DATABASE_URL: dbUrl, BIDZIZI_STAFF_PASSWORD: otherPassword }, stdio: "pipe" });
  } catch (error) { throw new Infra(`second org setup failed: ${error.message}`); }
  const { base } = await appServer(onExit, dbUrl);

  // ---------------------------------------------------------------- fixture (base-era APIs only)
  const staff = client(base), other = client(base), guest = client(base), rival = client(base), nobody = client(base);
  must(await staff("POST", "/api/v1/host/login", { email, password }), "staff login");
  must(await other("POST", "/api/v1/host/login", { email: "other@example.com", password: otherPassword }), "other-org login");
  const ev = must(await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Holiday Trade Show", startsAt: iso(-60_000), endsAt: iso(3 * 3_600_000) }), "create event");
  const eventId = ev.id;
  const add = async (title, openingMinor, category, donor, extra = {}) =>
    must(await staff("POST", `/api/v1/host/events/${eventId}/items`, { requestId: randomUUID(), title, openingMinor, category, donor, description: `${title}, donated for the show.`, ...extra }), `add ${title}`).id;
  const itemA = await add("Cabin weekend", 40_000, "Travel", "Juniper Cabins");
  const itemB = await add("Chef's table for six", 32_500, "Dining", "Harbor Kitchen");
  await add("Coffee for a year", 15_000, "Dining", "Harbor Roasters");
  const itemD = await add("Spa day", 12_000, "Wellness", "Lumen Spa");
  must(await staff("PUT", `/api/v1/host/events/${eventId}/sponsors`, { sponsors: [{ name: "Saturn Barter", url: "saturnbarter.com" }, { name: "Pasadena Chamber" }] }), "sponsors");
  must(await staff("POST", `/api/v1/host/events/${eventId}/recipients`, { name: "Red Cross", description: "Disaster relief, accepts any trade." }), "recipient");
  let w = must(await staff("GET", `/api/v1/host/events/${eventId}`), "workspace");
  w = must(await staff("PATCH", `/api/v1/host/events/${eventId}`, { revision: w.event.revision, venue: "Pasadena Convention Center",
    welcome: "Bid on donated trade from Saturn members. Every dollar stays in the network.", winnerInstructions: "Pick up at the Saturn table.", bidderDisplay: "anonymous" }), "event details");
  w = must(await staff("GET", `/api/v1/host/events/${eventId}`), "workspace");
  must(await staff("PATCH", `/api/v1/host/events/${eventId}`, { revision: w.event.revision, status: "live" }), "go live");
  const code = must(await staff("GET", `/api/v1/host/events/${eventId}`), "workspace").event.code;
  must(await rival("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), ...RIVAL }), "rival join");
  must(await rival("POST", `/api/v1/e/${code}/bid`, { requestId: randomUUID(), itemId: itemA, amountMinor: 40_000 }), "rival bid");
  must(await guest("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), ...PREVIEW_ME }), "guest join");
  const draft = must(await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Spring Mixer", startsAt: iso(86_400_000), endsAt: iso(90_000_000) }), "draft event");
  must(await staff("POST", `/api/v1/host/events/${draft.id}/items`, { requestId: randomUUID(), title: "Draft-only item", openingMinor: 5_000 }), "draft item");

  const previewPath = id => `/api/v1/host/events/${id}/preview`;
  const guestSnap = async () => must(await guest("GET", `/api/v1/e/${code}`), "guest snapshot");

  // ---------------------------------------------------------------- server preview snapshot
  {
    const leaks = [];
    for (const [who, call] of [["no session", nobody], ["guest", guest], ["other org", other]]) {
      const res = await call("GET", previewPath(eventId));
      if (res.status === 200 || ![401, 403, 404].includes(res.status) || res.text.includes("Cabin weekend")) leaks.push(`${who}: ${res.status}`);
    }
    r.expect("PREVIEW_API_STAFF_ONLY", leaks.length === 0, leaks.join("; ") || "refused for no session, guest and other org");
  }
  {
    const res = await staff("GET", previewPath(eventId));
    if (res.status !== 200) {
      for (const id of ["PREVIEW_API_MATCHES_GUEST", "PREVIEW_API_ANON"]) r.fail(id, `preview status ${res.status}`);
    } else {
      const p = res.data, g = await guestSnap();
      const problems = [];
      if (!p?.event || !Array.isArray(p.items) || !p.me) problems.push("missing event/items/me");
      else {
        if (!isDeepStrictEqual(p.event, g.event)) problems.push(`event differs: ${diffKeys(p.event, g.event)}`);
        const visible = p.items.filter(i => i.hidden !== true).map(({ hidden, ...rest }) => rest);
        if (visible.length !== g.items.length) problems.push(`visible items ${visible.length} vs guest ${g.items.length}`);
        visible.forEach((it, n) => { if (!isDeepStrictEqual(it, g.items[n])) problems.push(`item ${it.title ?? n} differs: ${diffKeys(it, g.items[n])}`); });
        if (p.me.displayName !== PREVIEW_ME.displayName || p.me.businessName !== PREVIEW_ME.businessName) problems.push("preview identity is not A guest / Your Business");
      }
      r.expect("PREVIEW_API_MATCHES_GUEST", problems.length === 0, problems.join("; ") || "event and every visible item equal the guest snapshot");
      const leader = p.items?.find(i => i.id === itemA)?.leader;
      const leaked = [RIVAL.displayName, RIVAL.businessName].filter(s => res.text.includes(s));
      r.expect("PREVIEW_API_ANON", !leaked.length && Boolean(leader) && leader.isMe === false,
        leaked.length ? `leaked ${leaked.join(", ")}` : leader ? "anonymous leader, no names in response" : "no leader shown for the bid item");
    }
    const d = await staff("GET", previewPath(draft.id));
    r.expect("PREVIEW_API_DRAFT", d.status === 200 && d.data?.items?.length === 1 && d.data.items[0].title === "Draft-only item",
      `draft preview status ${d.status}, items ${d.data?.items?.length ?? "-"}`);
  }

  // ---------------------------------------------------------------- the Studio canvas vs the guest app
  const browser = await chromium.launch().catch(e => { throw new Infra(`chromium unavailable: ${e.message}`); });
  onExit(() => browser.close());
  const guestCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await guestCtx.addCookies(guest.cookies());
  const freshCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const studioCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await studioCtx.addCookies(staff.cookies());
  const guestWrites = [];
  let previewFetched = false;
  studioCtx.on("request", req => {
    const u = new URL(req.url());
    if (u.pathname === previewPath(eventId)) previewFetched = true;
    if (/^\/api\/v1\/e\/[^/]+\/(bid|join|rejoin|watch|pledge)$/.test(u.pathname) && req.method() !== "GET") guestWrites.push(`${req.method()} ${u.pathname}`);
  });

  const guestUrl = s => s === "join" ? `/e/${code}` : s === "item" ? `/e/${code}?s=items&i=${itemB}` : s === "items" ? `/e/${code}` : `/e/${code}?s=${s}`;
  const studioUrl = s => `/studio/${eventId}?mode=setup&screen=${s}${s === "item" ? `&item=${itemB}` : ""}`;
  const studio = await studioCtx.newPage();
  for (const s of SCREENS) {
    const id = `CANVAS_PARITY_${s.toUpperCase()}`;
    const gp = await (s === "join" ? freshCtx : guestCtx).newPage();
    try {
      await gp.goto(base + guestUrl(s));
      const gShell = await shellIn(gp, s, false);
      if (!gShell) { r.fail(id, `guest app has no [data-guest-shell] with [data-guest-screen="${s}"]`); continue; }
      await studio.goto(base + studioUrl(s));
      const cShell = await shellIn(studio, s, true);
      if (!cShell) { r.fail(id, `canvas has no real guest shell showing "${s}" inside [data-preview-device]`); continue; }
      const [gLines, cLines] = [await linesOf(gShell), await linesOf(cShell)];
      const missing = minus(gLines, cLines), extra = minus(cLines, gLines);
      r.expect(id, !missing.length && !extra.length && gLines.length > 0,
        missing.length || extra.length ? `missing in canvas: ${JSON.stringify(missing.slice(0, 8))}; extra in canvas: ${JSON.stringify(extra.slice(0, 8))}` : `${gLines.length} text runs match`);
    } finally { await gp.close(); }
  }
  r.expect("CANVAS_USES_SERVER_PREVIEW", previewFetched, previewFetched ? "Studio fetched the server preview snapshot" : `Studio never requested ${previewPath(eventId)}`);

  // Bidding is off in the editor: tapping Bid in the canvas must not reach the guest write APIs.
  await studio.goto(base + studioUrl("item").replace(itemB, itemA));
  const shell = await shellIn(studio, "item", true);
  if (shell) {
    const bids = shell.locator("button", { hasText: /^\s*Bid\b/ });
    for (let n = 0; n < Math.min(await bids.count(), 3); n++) await bids.nth(n).click({ timeout: 3000 }).catch(() => {});
    await studio.waitForTimeout(1500);
  }
  r.expect("CANVAS_NO_GUEST_WRITES", guestWrites.length === 0, guestWrites.join(", ") || "no guest writes from the editor");

  // ---------------------------------------------------------------- hidden items: visible to staff, marked, never to guests
  const ws = must(await staff("GET", `/api/v1/host/events/${eventId}`), "workspace");
  const d = ws.items.find(i => i.id === itemD);
  must(await staff("PATCH", `/api/v1/host/items/${itemD}`, { revision: d.revision, ready: false }), "hide item");
  {
    const res = await staff("GET", previewPath(eventId)), g = await guestSnap();
    const hiddenRow = res.status === 200 ? res.data.items?.find(i => i.id === itemD) : null;
    const othersClean = res.status === 200 && res.data.items?.filter(i => i.id !== itemD).every(i => i.hidden !== true);
    r.expect("PREVIEW_API_HIDDEN_FLAGGED", Boolean(hiddenRow && hiddenRow.hidden === true && othersClean && !g.items.some(i => i.id === itemD)),
      `preview ${res.status}; hidden row ${hiddenRow ? `hidden=${hiddenRow.hidden}` : "absent"}; guest sees it: ${g.items.some(i => i.id === itemD)}`);
  }
  await studio.goto(base + studioUrl("items"));
  const itemsShell = await shellIn(studio, "items", true);
  const marked = itemsShell ? await itemsShell.locator("[data-preview-hidden]", { hasText: "Spa day" }).count() : 0;
  r.expect("CANVAS_HIDDEN_MARKED", marked > 0, marked ? "hidden item shown and marked in the canvas" : "no [data-preview-hidden] card for the hidden item");

  return r.write();
});

/** The guest shell showing screen `s`: in the guest app, or inside the Studio's preview device (directly or in a frame). */
async function shellIn(page, s, canvas) {
  const sel = `[data-guest-shell]:has([data-guest-screen="${s}"])`;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const roots = canvas ? [page.mainFrame().locator(`[data-preview-device] ${sel}`), ...page.frames().filter(f => f !== page.mainFrame()).map(f => f.locator(sel))] : [page.locator(sel)];
    for (const loc of roots) if (await loc.count().catch(() => 0)) { await page.waitForTimeout(1200); return loc.first(); }
    await page.waitForTimeout(500);
  }
  return null;
}

/** Visible text runs inside a shell, skipping edit-only chrome; countdown figures normalized. */
async function linesOf(loc) {
  const raw = await loc.evaluate(root => {
    const out = [];
    const walk = node => {
      if (node.nodeType === 3) { const t = node.textContent.replace(/\s+/g, " ").trim(); if (t) out.push(t); return; }
      if (node.nodeType !== 1) return;
      const el = node;
      if (el.matches("[data-edit-chrome], script, style, template, .skip")) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") return;
      for (const c of el.childNodes) walk(c);
    };
    walk(root);
    return out;
  });
  return raw.map(t => t.replace(/\b\d+\s?(?:d|h|m|s|hr|hrs|min|mins|sec|secs|days?|hours?|minutes?|seconds?)\b/gi, "#t")).sort();
}
function minus(a, b) { const left = [...b], out = []; for (const x of a) { const i = left.indexOf(x); if (i < 0) out.push(x); else left.splice(i, 1); } return out; }
function diffKeys(a, b) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  return [...keys].filter(k => !isDeepStrictEqual(a?.[k], b?.[k])).slice(0, 8).join(", ");
}
