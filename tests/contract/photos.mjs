#!/usr/bin/env node
// Contract real-v1-photos-001, acceptance: photos are framed (pan + zoom) everywhere guests see them, framed in
// place on the Studio phone, uploaded into a tray separately from assignment, and the Items workspace is polished.
// See tasks/real-v1-photos-001.toml for the frozen interface. Run only through the kernel verifier.
import { randomUUID } from "node:crypto";
import { chromium, webkit } from "@playwright/test";
import sharp from "sharp";
import { harness, receipt, requireVerifyEnv, database, appServer, client, must, Infra } from "./lib/stack.mjs";

const CHECK = "photos are framed everywhere and items workspace is polished";
const IDS = [
  "FRAME_API_VALIDATES", "FRAME_DEFAULT", "FRAME_DUPLICATES",
  "FRAME_PIXELS_CARD_CHROMIUM", "FRAME_PIXELS_CARD_WEBKIT", "FRAME_PIXELS_ITEM_PAGE", "FRAME_PIXELS_COVER", "FRAME_FILLS_BOX",
  "STUDIO_FRAME_IN_PLACE",
  "TRAY_UPLOADS_WITHOUT_ASSIGNING", "TRAY_DRAG_ASSIGNS", "TRAY_HEIC_EXPLAINED",
  "ITEMS_SPLIT_COLUMNS", "ITEMS_COMPACT_ROWS", "ITEMS_PREVIEW_COLLAPSED", "ITEMS_GUESTS_EXCEPTIONS",
];
const COLORS = { red: [220, 30, 30], green: [30, 170, 60], blue: [30, 60, 220], yellow: [240, 200, 30] };
const iso = ms => new Date(Date.now() + ms).toISOString();

/** 1200x800 JPEG: red top-left, green top-right, blue bottom-left, yellow bottom-right. */
async function quadrants() {
  const w = 1200, h = 800, raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = y < h / 2 ? (x < w / 2 ? COLORS.red : COLORS.green) : (x < w / 2 ? COLORS.blue : COLORS.yellow);
    raw.set(c, (y * w + x) * 3);
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
}
function nearest([r, g, b]) {
  let best = null, dist = Infinity;
  for (const [name, [R, G, B]] of Object.entries(COLORS)) { const d = (r - R) ** 2 + (g - G) ** 2 + (b - B) ** 2; if (d < dist) { dist = d; best = name; } }
  return dist < 70 ** 2 ? best : "other";
}
/** Colour names at interior sample points of an element (centre, and points 20% in from each side). */
async function samples(loc) {
  const png = await loc.screenshot({ animations: "disabled" });
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const at = (fx, fy) => { const x = Math.round(fx * (info.width - 1)), y = Math.round(fy * (info.height - 1)); const i = (y * info.width + x) * 3; return nearest([data[i], data[i + 1], data[i + 2]]); };
  return [at(0.5, 0.5), at(0.3, 0.4), at(0.7, 0.4), at(0.4, 0.65), at(0.6, 0.65)];
}
const all = (list, color) => list.every(c => c === color);

await harness(async onExit => {
  requireVerifyEnv();
  const r = receipt(CHECK, IDS);
  const { dbUrl, email, password } = await database(onExit);
  const { base } = await appServer(onExit, dbUrl);
  const staff = client(base), guest = client(base);
  must(await staff("POST", "/api/v1/host/login", { email, password }), "staff login");
  const jpeg = await quadrants();
  const upload = async () => {
    const res = await fetch(`${base}/api/v1/host/assets`, { method: "POST", headers: { origin: base, "content-type": "image/jpeg", cookie: staff.cookies().map(c => `${c.name}=${c.value}`).join("; ") }, body: jpeg });
    if (!res.ok) throw new Infra(`asset upload failed: ${res.status} ${await res.text()}`);
    return (await res.json()).id;
  };

  // ---------------------------------------------------------------- fixture (base-era APIs only)
  const ev = must(await staff("POST", "/api/v1/host/events", { requestId: randomUUID(), name: "Photo Show", startsAt: iso(-60_000), endsAt: iso(3 * 3_600_000) }), "event");
  const add = async (title, extra = {}) => must(await staff("POST", `/api/v1/host/events/${ev.id}/items`, { requestId: randomUUID(), title, openingMinor: 10_000, ...extra }), `item ${title}`).id;
  const framed = await add("Framed item"), plain = await add("Plain item"), noPhoto1 = await add("Needs photo one"), noPhoto2 = await add("Needs photo two");
  const hiddenItem = await add("Hidden item");
  const asset1 = await upload(), asset2 = await upload(), coverAsset = await upload();
  const ws = async () => must(await staff("GET", `/api/v1/host/events/${ev.id}`), "workspace");
  const itemRev = async id => (await ws()).items.find(i => i.id === id).revision;
  must(await staff("PATCH", `/api/v1/host/items/${framed}`, { revision: await itemRev(framed), imageAssetId: asset1 }), "set photo");
  must(await staff("PATCH", `/api/v1/host/items/${plain}`, { revision: await itemRev(plain), imageAssetId: asset2 }), "set photo 2");
  let w = await ws();
  must(await staff("PATCH", `/api/v1/host/events/${ev.id}`, { revision: w.event.revision, coverAssetId: coverAsset }), "cover");
  w = await ws();
  must(await staff("PATCH", `/api/v1/host/events/${ev.id}`, { revision: w.event.revision, status: "live" }), "go live");
  must(await staff("PATCH", `/api/v1/host/items/${hiddenItem}`, { revision: await itemRev(hiddenItem), ready: false }), "hide");
  const code = (await ws()).event.code;
  must(await guest("POST", `/api/v1/e/${code}/join`, { requestId: randomUUID(), displayName: "A guest", businessName: "Your Business" }), "guest join");
  const snapItem = async id => must(await guest("GET", `/api/v1/e/${code}`), "snapshot").items.find(i => i.id === id);
  const setFrame = async (id, frame) => staff("PATCH", `/api/v1/host/items/${id}`, { revision: await itemRev(id), imageFrame: frame });

  // ---------------------------------------------------------------- frame API
  {
    const bad = [{ x: 0.5, y: 0.5, zoom: 0.5 }, { x: 1.5, y: 0.5, zoom: 1 }, { x: 0.5, y: -0.1, zoom: 1 }, { x: 0.5, y: 0.5, zoom: 5 }, { x: 0.5, y: 0.5 }, "centre"];
    const accepted = [];
    for (const f of bad) { const res = await setFrame(framed, f); if (res.status !== 400) accepted.push(`${JSON.stringify(f)} → ${res.status}`); }
    const good = await setFrame(framed, { x: 0.3, y: 0.7, zoom: 2 });
    const seen = (await snapItem(framed))?.imageFrame;
    const goodOk = good.status === 200 && seen && Math.abs(seen.x - 0.3) < 1e-6 && Math.abs(seen.y - 0.7) < 1e-6 && Math.abs(seen.zoom - 2) < 1e-6;
    r.expect("FRAME_API_VALIDATES", !accepted.length && goodOk, accepted.length ? `accepted invalid: ${accepted.join("; ")}` : goodOk ? "invalid refused, valid saved and served" : `valid frame: ${good.status} ${JSON.stringify(seen)}`);
    const p = (await snapItem(plain))?.imageFrame, c = must(await guest("GET", `/api/v1/e/${code}`), "snap").event.coverFrame;
    const isDefault = f => f && f.x === 0.5 && f.y === 0.5 && f.zoom === 1;
    r.expect("FRAME_DEFAULT", isDefault(p) && isDefault(c), `item ${JSON.stringify(p)}, cover ${JSON.stringify(c)}`);
    const dup = await staff("POST", `/api/v1/host/events/${ev.id}/duplicate`, { requestId: randomUUID() });
    const dw = dup.status === 201 || dup.status === 200 ? must(await staff("GET", `/api/v1/host/events/${dup.data.id}`), "dup ws") : null;
    const copy = dw?.items.find(i => i.title === "Framed item");
    r.expect("FRAME_DUPLICATES", Boolean(copy?.imageFrame && copy.imageFrame.zoom === 2 && copy.imageFrame.x === 0.3), `duplicate ${dup.status}, copy frame ${JSON.stringify(copy?.imageFrame)}`);
  }

  // ---------------------------------------------------------------- pixels: the frame actually moves and crops
  const browsers = {};
  const open = async (kind, viewport) => {
    browsers[kind] ??= await (kind === "webkit" ? webkit : chromium).launch().catch(e => { throw new Infra(`${kind} unavailable: ${e.message}`); });
    const ctx = await browsers[kind].newContext({ viewport, deviceScaleFactor: 1 });
    await ctx.addCookies(guest.cookies());
    return ctx;
  };
  onExit(async () => { for (const b of Object.values(browsers)) await b.close(); });
  const cardPhoto = page => page.locator(`[data-item-card="${framed}"] [data-photo-frame]`).first();
  async function cardColors(kind, frame) {
    if ((await setFrame(framed, frame)).status !== 200) return ["frame not saved"];
    const ctx = await open(kind, { width: 390, height: 844 }), page = await ctx.newPage();
    try {
      await page.goto(`${base}/e/${code}`);
      const loc = cardPhoto(page);
      if (!await loc.waitFor({ timeout: 30_000 }).then(() => true, () => false)) return ["no [data-item-card] [data-photo-frame]"];
      await loc.scrollIntoViewIfNeeded(); await page.waitForTimeout(800);
      return await samples(loc);
    } finally { await ctx.close(); }
  }
  for (const kind of ["chromium", "webkit"]) {
    const a = await cardColors(kind, { x: 0.25, y: 0.25, zoom: 2.5 }), b = await cardColors(kind, { x: 0.75, y: 0.75, zoom: 2.5 });
    r.expect(`FRAME_PIXELS_CARD_${kind.toUpperCase()}`, all(a, "red") && all(b, "yellow"), `top-left frame → ${a.join(",")}; bottom-right frame → ${b.join(",")}`);
  }
  {
    await setFrame(framed, { x: 0.75, y: 0.25, zoom: 2.5 });
    const ctx = await open("chromium", { width: 390, height: 844 }), page = await ctx.newPage();
    await page.goto(`${base}/e/${code}?s=items&i=${framed}`);
    const loc = page.locator('[data-guest-screen="item"] [data-photo-frame]').first();
    const got = await loc.waitFor({ timeout: 30_000 }).then(() => samples(loc), () => ["no item hero [data-photo-frame]"]);
    r.expect("FRAME_PIXELS_ITEM_PAGE", all(got, "green"), `item hero → ${got.join(",")}`);
    await ctx.close();
  }
  {
    w = await ws();
    const res = await staff("PATCH", `/api/v1/host/events/${ev.id}`, { revision: w.event.revision, coverFrame: { x: 0.25, y: 0.75, zoom: 2.5 } });
    const fresh = await (await (browsers.chromium)).newContext({ viewport: { width: 390, height: 844 } });
    const page = await fresh.newPage();
    await page.goto(`${base}/e/${code}`);
    const loc = page.locator('[data-guest-screen="join"] [data-photo-frame]').first();
    const got = res.status !== 200 ? [`cover frame not saved (${res.status})`] : await loc.waitFor({ timeout: 30_000 }).then(() => samples(loc), () => ["no welcome [data-photo-frame]"]);
    r.expect("FRAME_PIXELS_COVER", all(got, "blue"), `welcome cover → ${got.join(",")}`);
    await fresh.close();
  }
  {
    const problems = [];
    for (const frame of [{ x: 0, y: 0, zoom: 1 }, { x: 1, y: 1, zoom: 1 }, { x: 0, y: 1, zoom: 4 }, { x: 0.5, y: 0.5, zoom: 1 }]) {
      if ((await setFrame(framed, frame)).status !== 200) { problems.push(`${JSON.stringify(frame)} not saved`); continue; }
      const ctx = await open("chromium", { width: 390, height: 844 }), page = await ctx.newPage();
      await page.goto(`${base}/e/${code}`);
      const loc = cardPhoto(page);
      if (!await loc.waitFor({ timeout: 30_000 }).then(() => true, () => false)) { problems.push("no card photo frame"); await ctx.close(); continue; }
      const gap = await loc.evaluate(box => {
        const img = box.querySelector("img"); if (!img) return "no img";
        const b = box.getBoundingClientRect(), i = img.getBoundingClientRect();
        return i.left <= b.left + 1 && i.top <= b.top + 1 && i.right >= b.right - 1 && i.bottom >= b.bottom - 1 ? "" : `img ${Math.round(i.left)},${Math.round(i.top)},${Math.round(i.right)},${Math.round(i.bottom)} vs box ${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)}`;
      });
      if (gap) problems.push(`${JSON.stringify(frame)}: ${gap}`);
      await ctx.close();
    }
    r.expect("FRAME_FILLS_BOX", !problems.length, problems.join("; ") || "photo always fills its frame, even at the edges and at max zoom");
  }

  // ---------------------------------------------------------------- Studio: framing in place on the phone
  const studioCtx = await browsers.chromium.newContext({ viewport: { width: 1440, height: 1000 } });
  await studioCtx.addCookies(staff.cookies());
  {
    await setFrame(framed, { x: 0.5, y: 0.5, zoom: 1 });
    const page = await studioCtx.newPage();
    let detail = "";
    try {
      await page.goto(`${base}/studio/${ev.id}?mode=setup&screen=item&item=${framed}`);
      await page.getByRole("button", { name: "Adjust photo", exact: true }).first().click({ timeout: 30_000 });
      const editor = page.locator("[data-preview-device] [data-frame-editor]").first();
      await editor.waitFor({ timeout: 10_000 });
      const zoom = editor.getByRole("slider", { name: "Zoom" }).or(page.getByRole("slider", { name: "Zoom" })).first();
      await zoom.focus(); for (let n = 0; n < 6; n++) await page.keyboard.press("ArrowRight");
      const b = await editor.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 - 80, b.y + b.height / 2, { steps: 8 }); await page.mouse.up();
      await page.getByRole("button", { name: "Done", exact: true }).first().click({ timeout: 5_000 });
      await page.waitForTimeout(2500);
      const f = (await ws()).items.find(i => i.id === framed).imageFrame;
      detail = `saved ${JSON.stringify(f)}`;
      r.expect("STUDIO_FRAME_IN_PLACE", Boolean(f && f.zoom > 1 && f.x > 0.5), detail);
    } catch (error) { r.fail("STUDIO_FRAME_IN_PLACE", `${detail} ${error.message.split("\n")[0]}`); }
    finally { await page.close(); }
  }

  // ---------------------------------------------------------------- photo tray: upload ≠ assign
  {
    const page = await studioCtx.newPage();
    const tmp = await Promise.all(["IMG_0001.jpg", "IMG_0002.jpg", "IMG_0003.jpg"].map(async name => ({ name, mimeType: "image/jpeg", buffer: jpeg })));
    try {
      await page.goto(`${base}/studio/${ev.id}?mode=setup&view=items`);
      const input = page.locator("input[type=file][data-tray-input]").first();
      await input.waitFor({ state: "attached", timeout: 30_000 });
      await input.setInputFiles(tmp);
      const ready = page.locator('[data-photo-tray] [data-tray-photo][data-state="ready"]');
      await ready.nth(2).waitFor({ timeout: 90_000 });
      const before = (await ws()).items;
      const untouched = !before.find(i => i.id === noPhoto1).imageAssetId && !before.find(i => i.id === noPhoto2).imageAssetId;
      r.expect("TRAY_UPLOADS_WITHOUT_ASSIGNING", untouched && (await ready.count()) === 3, untouched ? "3 photos ready in the tray, no item changed" : "an item changed before assignment");
      await ready.first().dragTo(page.locator(`[data-item-row="${noPhoto1}"]`).first());
      await page.waitForTimeout(2500);
      const after = (await ws()).items.find(i => i.id === noPhoto1);
      const left = await page.locator("[data-photo-tray] [data-tray-photo]").count();
      r.expect("TRAY_DRAG_ASSIGNS", Boolean(after.imageAssetId) && left === 2, `item photo ${after.imageAssetId ? "set" : "missing"}, tray now ${left}`);
    } catch (error) {
      for (const id of ["TRAY_UPLOADS_WITHOUT_ASSIGNING", "TRAY_DRAG_ASSIGNS"]) r.fail(id, error.message.split("\n")[0]);
    }
    try {
      const input = page.locator("input[type=file][data-tray-input]").first();
      await input.setInputFiles([{ name: "IMG_4242.HEIC", mimeType: "image/heic", buffer: Buffer.from("not really a heic file, but Chromium can't decode it either") }]);
      const failed = page.locator('[data-photo-tray] [data-tray-photo][data-state="failed"]', { hasText: /JPEG/i });
      const ok = await failed.first().waitFor({ timeout: 30_000 }).then(() => true, () => false);
      r.expect("TRAY_HEIC_EXPLAINED", ok, ok ? "HEIC stays in the tray as failed, telling the user to use JPEG" : "no failed tray entry mentioning JPEG");
    } catch (error) { r.fail("TRAY_HEIC_EXPLAINED", error.message.split("\n")[0]); }
    await page.close();
  }

  // ---------------------------------------------------------------- Items workspace polish
  {
    const fresh = await browsers.chromium.newContext({ viewport: { width: 1440, height: 1000 } });
    await fresh.addCookies(staff.cookies());
    const page = await fresh.newPage();
    await page.goto(`${base}/studio/${ev.id}?mode=setup&view=items`);
    const row = page.locator(`[data-item-row="${framed}"]`).first();
    const loaded = await row.waitFor({ timeout: 30_000 }).then(() => true, () => false);
    if (!loaded) for (const id of ["ITEMS_SPLIT_COLUMNS", "ITEMS_COMPACT_ROWS", "ITEMS_PREVIEW_COLLAPSED", "ITEMS_GUESTS_EXCEPTIONS"]) r.fail(id, "no [data-item-row] rows in the Items workspace");
    else {
      const starting = await page.getByRole("columnheader", { name: "Starting", exact: true }).count();
      const top = await page.getByRole("columnheader", { name: "Top bid", exact: true }).count();
      r.expect("ITEMS_SPLIT_COLUMNS", starting > 0 && top > 0, `Starting header ${starting}, Top bid header ${top}`);
      const collapsed = !(await page.locator("[data-preview-device]").first().isVisible().catch(() => false));
      await page.getByRole("button", { name: "Show guest phone", exact: true }).first().click({ timeout: 5_000 }).catch(() => {});
      const opens = await page.locator("[data-preview-device]").first().isVisible().catch(() => false);
      r.expect("ITEMS_PREVIEW_COLLAPSED", collapsed && opens, `collapsed on first visit: ${collapsed}; opens with "Show guest phone": ${opens}`);
      const visibleRowSaysVisible = await page.locator(`[data-item-row="${plain}"]`).first().getByText("Visible", { exact: true }).count();
      const hiddenRowSaysHidden = await page.locator(`[data-item-row="${hiddenItem}"]`).first().getByText("Hidden", { exact: true }).count();
      r.expect("ITEMS_GUESTS_EXCEPTIONS", visibleRowSaysVisible === 0 && hiddenRowSaysHidden > 0, `visible row shows "Visible": ${visibleRowSaysVisible}; hidden row shows "Hidden": ${hiddenRowSaysHidden}`);
      let compact = false, height = 0;
      const toggle = page.getByRole("button", { name: "Compact", exact: true }).or(page.getByRole("radio", { name: "Compact", exact: true })).or(page.getByRole("switch", { name: "Compact", exact: true })).first();
      if (await toggle.click({ timeout: 5_000 }).then(() => true, () => false)) {
        await page.waitForTimeout(500);
        height = (await row.boundingBox())?.height ?? 0; compact = height > 0 && height <= 64;
      }
      r.expect("ITEMS_COMPACT_ROWS", compact, height ? `compact row height ${Math.round(height)}px` : "no Compact control");
    }
    await fresh.close();
  }
  await studioCtx.close();
  return r.write();
});
