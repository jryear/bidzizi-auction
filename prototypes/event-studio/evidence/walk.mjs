import {
  chromium,
  webkit,
  expect,
} from "../../../node_modules/@playwright/test/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
const URL_ = process.env.URL || "http://127.0.0.1:4340/event-studio/";
const out = new URL("./shots/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const results = [],
  errors = [],
  requests = [];
const check = (name, ok) => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) throw new Error(name);
};
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("request", (r) => requests.push(r.url()));
const shot = async (name) => {
  if (page.url().includes("/edit/"))
    await expect(page.locator("dialog")).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  await page.screenshot({ path: out + name + ".png" });
};
const state = () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("bidzizi.event-studio.workspace.v1")),
  );
const active = async () => {
  const s = await state();
  return s.events.find((e) => e.id === locationId());
};
let eventId = "holiday";
const locationId = () => eventId;
const button = (name, exact = true) =>
  page
    .locator("dialog[open], body:not(:has(dialog[open]))")
    .getByRole("button", { name, exact });
const fill = async (name, value) => {
  await page.locator(`#edit-form [name="${name}"]`).fill(value);
};
const select = async (name, value) =>
  page.locator(`#edit-form [name="${name}"]`).selectOption(value);
const close = async () => {
  await button("Close editor").click();
  await expect(page.locator("dialog")).not.toBeVisible();
};
const save = async (name = "Save changes") => {
  await button(name).click();
  await expect(page.locator("dialog")).not.toBeVisible();
};
const go = async (name) => {
  await page
    .locator(".sidebar")
    .getByRole("link", { name, exact: true })
    .click();
  await expect(page.locator("#main h1")).toHaveText(
    { "Auction workspace": "Lots", Presentation: "Event presentation" }[name] ||
      name,
  );
};
try {
  await page.goto(URL_);
  await expect(page.locator("#main h1")).toHaveText("Lots");
  check(
    "seed has two organization events",
    (await state()).events.length === 2,
  );
  check(
    "seed exposes unassigned and uncategorized counts",
    (await button("Unassigned · 2").isVisible()) &&
      (await button("Uncategorized · 1").isVisible()),
  );
  await page.locator("#select-visible").check();
  await expect(page.locator(".bulk .count")).toHaveText("7 selected");
  await shot("01-workspace-bulk-desktop");
  await button("Assign").click();
  check(
    "bulk assignment without a target validates",
    (await page.locator("#notice").innerText()) ===
      "Choose a bidding window first.",
  );
  await button("Clear selection").click();
  await page.locator("#search").fill("coffee");
  check(
    "search keeps input focus while narrowing rows",
    (await page.locator(".lot-row").count()) === 1 &&
      (await page
        .locator("#search")
        .evaluate((el) => el === document.activeElement)),
  );
  await page.locator("#search").fill("no-matching-thing");
  check(
    "empty search has a recovery action",
    await button("Clear filters").isVisible(),
  );
  await button("Clear filters").click();
  await page.locator("#event-switch").selectOption("spring");
  await expect(page.locator(".lot-row")).toHaveCount(3);
  check(
    "switching events changes catalog",
    (await page.locator("#main h1").innerText()) === "Lots",
  );
  await page.locator("#event-switch").selectOption("holiday");
  await expect(page.locator(".lot-row")).toHaveCount(7);
  check("returning event retains its catalog", true);
  await button("+ Create event").click();
  await fill("name", "   ");
  await button("Create event").click();
  check(
    "whitespace name is rejected",
    (await page.locator("#form-error").innerText()) ===
      "Enter a name before saving.",
  );
  await fill("name", "Autumn Makers Evening");
  await save("Create event");
  eventId = (await state()).ui.active;
  await expect(page.locator("#main h1")).toHaveText("Event overview");
  check(
    "new event starts empty and isolated",
    (await active()).lots.length === 0 &&
      (await state()).events.find((e) => e.id === "holiday").lots.length === 7,
  );
  await button("Edit welcome & details").click();
  await fill(
    "welcome",
    "Meet our local makers, discover something special, and enjoy an evening together.",
  );
  await select("heading", "dinner");
  await fill("date", "2026-11-06T17:30");
  await fill("location", "Northline Hall · Portland");
  await save();
  check(
    "physical details save independently of windows",
    (await active()).date === "2026-11-06T17:30" &&
      (await active()).windows.length === 0,
  );
  await go("Auction workspace");
  await button("Add lot").first().click();
  await fill("title", "A weekend in the evergreens");
  await fill("opening", "100.001");
  await button("Add lot").click();
  check(
    "amounts beyond two decimal places rejected",
    (await page.locator("#form-error").innerText()).includes(
      "two decimal places",
    ),
  );
  await fill("opening", "100");
  await fill("increment", "25");
  check(
    "increment example shows next eligible bid",
    (await page.locator("#increment-example").innerText()).includes("$125"),
  );
  await fill(
    "description",
    "Two quiet nights in a woodland cabin for two guests.",
  );
  await select("image", "cabin");
  await save("Add lot");
  check(
    "opening and increment persist as integer cents",
    (await active()).lots[0].opening === 10000 &&
      (await active()).lots[0].increment === 2500,
  );
  await button("A weekend in the evergreens").click();
  await shot("02-lot-editor-increment");
  await button("Duplicate lot").dblclick();
  await expect(page.locator("dialog")).not.toBeVisible();
  check(
    "repeated duplicate clicks create exactly one copy",
    (await active()).lots.length === 2,
  );
  await button("Add lot").click();
  await fill("title", "Dinner at the makers’ table");
  await save("Add lot");
  check(
    "incomplete draft lot remains clearly actionable",
    await button("Needs attention · 3").isVisible(),
  );
  await page.getByRole("link", { name: "Readiness", exact: true }).click();
  await expect(page.locator("#main h1")).toHaveText("Review readiness");
  check(
    "incomplete setup blocks readiness review",
    await button("Record local readiness review").isDisabled(),
  );
  await page
    .locator(".check-row")
    .nth(2)
    .getByRole("button", { name: /Resolve/ })
    .click();
  await expect(page.locator("#main h1")).toHaveText("Lots");
  await expect(button("Uncategorized · 3")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  check(
    "readiness Resolve opens the actionable lot filter",
    (await page.locator(".lot-row").count()) === 3,
  );
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await button("New category").first().click();
  await fill("name", "Experiences");
  await save();
  await button("New category").first().click();
  await fill("name", "experiences");
  await button("Save changes").click();
  check(
    "case-insensitive duplicate category is rejected",
    (await page.locator("#form-error").innerText()).includes("already exists"),
  );
  await button("Discard editor draft").click();
  await expect(page.locator("dialog")).not.toBeVisible();
  await page.getByRole("link", { name: "Lots", exact: true }).click();
  await page.locator("#select-visible").check();
  await page.locator("#bulk-category").selectOption("Experiences");
  await button("Categorize").click();
  check(
    "bulk category assignment reaches all selected lots",
    (await active()).lots.every((l) => l.category === "Experiences"),
  );
  await page
    .getByRole("link", { name: "Bidding windows", exact: true })
    .click();
  await button("New window").first().click();
  await fill("name", "Opening collection");
  await fill("start", "2026-11-06T16:00");
  await fill("end", "2026-11-06T15:00");
  await button("Save changes").click();
  check(
    "reversed bidding interval is rejected",
    (await page.locator("#form-error").innerText()).includes("after opening"),
  );
  await fill("end", "2026-11-06T17:00");
  await save();
  await button("New window").click();
  await fill("name", "Evening collection");
  await fill("start", "2026-11-06T18:00");
  await fill("end", "2026-11-06T19:30");
  await save();
  const windows = (await active()).windows;
  check(
    "two bidding windows remain separate from categories",
    windows.length === 2 && (await active()).categories.length === 1,
  );
  await button("Assign lots").click();
  await expect(page.locator(".lot-row")).toHaveCount(3);
  await page.locator(".lot-row input").nth(0).check();
  await page.locator(".lot-row input").nth(1).check();
  await page.locator("#bulk-window").selectOption(windows[0].id);
  await button("Assign").click();
  await expect(page.locator(".lot-row")).toHaveCount(1);
  await page.locator("#select-visible").check();
  await page.locator("#bulk-window").selectOption(windows[1].id);
  await button("Assign").click();
  check(
    "unassigned view empties after bulk assignment",
    (await page.locator(".lot-row").count()) === 0,
  );
  await button("All lots").click();
  check(
    "one window per lot stored as a single reference",
    (await active()).lots.every((l) => typeof l.window === "string") &&
      (await active()).lots[0].window === windows[0].id &&
      (await active()).lots[2].window === windows[1].id,
  );
  await button("Bidder preview").click();
  const frame = page.frameLocator("iframe");
  await expect(frame.locator(".card")).toHaveCount(3);
  check("draft preview shows all three staff draft lots", true);
  await frame.locator(".card-link").first().click();
  await expect(frame.locator(".d-title")).toHaveText(
    "A weekend in the evergreens",
  );
  check(
    "preview reuses A detail and has no bid action",
    (await frame.locator(".stub").count()) === 1 &&
      (await frame.locator('[data-action="bid"]').count()) === 0,
  );
  await shot("03-mobile-bidder-preview");
  await frame.locator(".back").click();
  await expect(frame.locator(".card")).toHaveCount(3);
  await frame.getByRole("link", { name: "Welcome", exact: true }).click();
  await expect(frame.locator("h1")).toHaveText("Autumn Makers Evening");
  check(
    "preview welcome contains edited event details",
    (await frame.locator(".entry-facts").innerText()).includes(
      "Northline Hall",
    ),
  );
  await page.evaluate(() => history.back());
  await expect(page.locator("dialog")).not.toBeVisible();
  check(
    "browser Back closes preview without leaving lots",
    (await page.locator("#main h1").innerText()) === "Lots",
  );
  await button("Dinner at the makers’ table").click();
  await fill(
    "description",
    "A five-course dinner for six, prepared by local makers.",
  );
  await page.reload();
  await expect(page.locator("dialog")).toBeVisible();
  check(
    "reload recovers unsaved editor draft",
    (await page.locator('[name="description"]').inputValue()).includes(
      "five-course",
    ),
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).not.toBeVisible();
  await button("Dinner at the makers’ table").click();
  check(
    "close retains editor draft",
    (await page.locator('[name="description"]').inputValue()).includes(
      "five-course",
    ),
  );
  await select("image", "dinner");
  await save();
  await page.getByRole("link", { name: "Readiness", exact: true }).click();
  await expect(page.locator(".check-state.ok")).toHaveCount(5);
  await button("Record local readiness review").dblclick();
  check(
    "local readiness review records current revision",
    (await active()).review.revision === (await active()).revision,
  );
  await shot("04-readiness-reviewed");
  await page.reload();
  await expect(page.locator(".check-state.ok")).toHaveCount(5);
  check(
    "saved data and readiness review survive reload",
    !!(await active()).review && (await active()).lots.length === 3,
  );
  await page
    .locator(".check-row")
    .nth(1)
    .getByRole("button", { name: /Inspect/ })
    .click();
  await expect(page.locator("#main h1")).toHaveText("Lots");
  await expect(page.locator(".lot-row")).toHaveCount(3);
  check(
    "readiness Inspect opens completed content rather than an empty issue filter",
    true,
  );
  await page.getByRole("link", { name: "Readiness", exact: true }).click();
  await expect(page.locator("#main h1")).toHaveText("Review readiness");
  await page.locator("#event-switch").selectOption("holiday");
  await expect(page.locator("#main h1")).toHaveText("Review readiness");
  check(
    "event switching does not mix categories windows or reviews",
    (await state()).events.find((e) => e.id === "holiday").review === null &&
      (await state()).events.find((e) => e.id === "holiday").categories
        .length === 4,
  );
  await page.locator("#event-switch").selectOption(eventId);
  await expect(page.locator(".check-state.ok")).toHaveCount(5);
  await go("Displays");
  await page
    .locator('#display-form [name="title"]')
    .fill("Tonight’s local finds");
  check(
    "live draft changes before apply",
    (await page.locator("#draft-display").innerText()).includes(
      "Tonight’s local finds",
    ) && (await active()).display.applied === null,
  );
  await page.reload();
  await expect(page.locator('#display-form [name="title"]')).toHaveValue(
    "Tonight’s local finds",
  );
  check(
    "display draft survives reload without being applied",
    (await active()).display.applied === null,
  );
  await button("Apply to simulated display").click();
  const applied = (await active()).display.applied;
  await page
    .locator('#display-form [name="title"]')
    .fill("A new draft heading");
  await page.locator('#display-form [name="layout"]').selectOption("list");
  check(
    "applied display remains unchanged while editing draft",
    (await active()).display.applied.title === applied.title &&
      (await active()).display.draft.title === "A new draft heading",
  );
  await shot("05-displays-draft-applied");
  await button("Apply to simulated display").dblclick();
  check(
    "repeated apply remains a single local configuration",
    (await active()).display.applied.title === "A new draft heading",
  );
  await go("Notifications");
  await button("Run simulated readiness test").click();
  check(
    "SMS prerequisites block simulated check",
    (await page.locator("#notice").innerText()).includes(
      "Review the demo sender",
    ),
  );
  await page.locator('[data-sms="sender"]').check();
  await page.locator('[data-sms="consent"]').check();
  await page.locator("#sms-outcome").selectOption("failed");
  await button("Run simulated readiness test").click();
  await expect(button("Checking fixture…")).toBeDisabled();
  check("SMS pending state prevents repeated checks", true);
  await expect(page.locator(".sms-state h3")).toHaveText(
    "Simulated test failed",
  );
  await button("Run simulated readiness test").click();
  await page.reload();
  await expect(page.locator(".sms-state h3")).toHaveText("Test interrupted");
  check("reload of pending SMS is interrupted without success", true);
  await button("Run simulated readiness test").click();
  await expect(page.locator(".sms-state h3")).toHaveText(
    "Demo readiness complete",
  );
  check(
    "SMS fixture passes with explicit no-delivery truth",
    (await page.locator(".sms-state").innerText()).includes(
      "No provider connection or delivery was verified",
    ),
  );
  await go("Donations");
  await page.locator('#donation-form [name="enabled"]').check();
  await page
    .locator('#donation-form [name="description"]')
    .fill(
      "Learn about the makers’ community fund. Giving mechanics are still under review.",
    );
  await button("Save donation presentation").click();
  await page.reload();
  check(
    "donation wording persists with no payment controls",
    (await active()).donation.enabled &&
      (await page.locator('[name="description"]').inputValue()) ===
        "Learn about the makers’ community fund. Giving mechanics are still under review." &&
      (await page.locator('input[type="number"]').count()) === 0,
  );
  await go("Attendees & access");
  check(
    "access destination contains one shared QR",
    (await page.locator(".qr-card svg").count()) === 1 &&
      (await page.locator("#main").innerText()).includes(
        "not an admission credential",
      ),
  );
  const shared = await page.locator(".link-code").innerText();
  await button("Present QR").click();
  await expect(page.locator("dialog svg")).toHaveCount(2);
  check(
    "QR presentation keeps same event link",
    (await page.locator("dialog .link-code").innerText()) === shared,
  );
  await shot("06-shared-event-qr");
  await close();
  await page.evaluate(() => {
    window.print = () => (window.printInvoked = true);
  });
  await button("Print QR").click();
  check(
    "print action creates printable shared-link sheet",
    await page.evaluate(
      () =>
        window.printInvoked &&
        document
          .querySelector(".print-sheet")
          .textContent.includes("not an individual admission credential"),
    ),
  );
  await go("Presentation");
  await button("+ Add sponsor").click();
  await fill("name", "Juniper Studio");
  await save();
  check(
    "sponsor is optional event presentation",
    (await active()).sponsors.includes("Juniper Studio"),
  );
  await page.getByRole("link", { name: "Readiness", exact: true }).click();
  await expect(page.locator("#main h1")).toHaveText("Review readiness");
  check(
    "content edit makes prior review stale",
    (await page.locator("#main").innerText()).includes(
      "Draft changed since the last review",
    ),
  );
  await button("Record local readiness review").click();
  await go("Auction workspace");
  await page.locator("#search").fill("weekend");
  await button("A weekend in the evergreens").click();
  await close();
  check(
    "close restores opener keyboard focus",
    await button("A weekend in the evergreens").evaluate(
      (el) => el === document.activeElement,
    ),
  );
  await page.reload();
  check(
    "lot filters survive reload",
    (await page.locator("#search").inputValue()) === "weekend" &&
      (await page.locator(".lot-row").count()) === 2,
  );
  await button("A weekend in the evergreens").click();
  await page.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function () {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await fill("title", "Unable to save this edit");
  await button("Save changes").click();
  check(
    "storage failure leaves editor open with truthful error",
    (await page.locator("dialog").isVisible()) &&
      (await page.locator("#notice").innerText()).includes(
        "Could not save locally",
      ) &&
      (await page.locator(".local-state").innerText()).includes("failed"),
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalSetItem;
  });
  await fill("title", "A weekend in the evergreens");
  await save();
  check(
    "storage failure can recover and save without stale event reference",
    (await active()).lots[0].title === "A weekend in the evergreens",
  );
  await page.locator("#search").fill("");
  await page.setViewportSize({ width: 1280, height: 800 });
  await shot("07-laptop-workspace");
  check(
    "1280 laptop has no page overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  check(
    "1024 laptop has no page overflow",
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await shot("08-small-laptop-workspace");
  // Stress the returning-staff table with 60 fictional lots in this disposable test context.
  await page.evaluate((id) => {
    const key = "bidzizi.event-studio.workspace.v1",
      d = JSON.parse(localStorage.getItem(key)),
      e = d.events.find((e) => e.id === id),
      base = e.lots[0];
    e.lots = Array.from({ length: 60 }, (_, i) => ({
      ...base,
      id: "stress-" + i,
      title: `Maker collection ${String(i + 1).padStart(2, "0")}`,
    }));
    localStorage.setItem(key, JSON.stringify(d));
  }, eventId);
  await page.reload();
  await page.locator("#select-visible").check();
  check(
    "60 visible lots can be selected for bulk work",
    (await page.locator(".bulk .count").innerText()) === "60 selected",
  );
  await page.locator("#bulk-window").selectOption(windows[1].id);
  await button("Assign").click();
  check(
    "bulk assignment persists all 60 items",
    (await active()).lots.every((l) => l.window === windows[1].id),
  );
  check("no browser console or page errors", errors.length === 0);
  check(
    "all browser requests remain on loopback",
    requests.every((u) => u.startsWith(new URL(URL_).origin + "/")),
  );
  const wk = await webkit.launch();
  try {
    const wc = await wk.newContext({ viewport: { width: 1280, height: 800 } }),
      wp = await wc.newPage();
    await wp.goto(URL_);
    await expect(wp.locator("h1")).toHaveText("Lots");
    await wp.getByRole("button", { name: "Add lot", exact: true }).click();
    await wp.locator('[name="title"]').fill("WebKit keyboard draft");
    await wp.keyboard.press("Escape");
    await expect(wp.locator("dialog")).not.toBeVisible();
    await wp.getByRole("button", { name: "Add lot", exact: true }).click();
    check(
      "WebKit editor closes with Escape and recovers draft",
      (await wp.locator('[name="title"]').inputValue()) ===
        "WebKit keyboard draft",
    );
    await wp.screenshot({ path: out + "09-webkit-editor.png" });
    await wc.close();
  } finally {
    await wk.close();
  }
} catch (e) {
  console.error(e);
  results.push({
    name: "Unhandled journey failure",
    ok: false,
    error: e.message,
  });
  process.exitCode = 1;
} finally {
  await browser.close();
  writeFileSync(
    new URL("./results.json", import.meta.url),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        runtime: process.version,
        results,
        errors,
        externalRequests: requests.filter(
          (u) => !u.startsWith(new URL(URL_).origin + "/"),
        ),
      },
      null,
      2,
    ),
  );
  console.log(`${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}
