import {
  db,
  persist,
  transact,
  eventById,
  emptyEvent,
  uid,
  money,
  checks,
  lotIssues,
  touch,
  dateLabel,
  validWindow,
} from "./model.js";
import qrcode from "./vendor/qrcode.mjs";
const app = document.querySelector("#app"),
  dialog = document.querySelector("#editor");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const images = ["cabin", "coffee", "dinner", "ceramics", "bicycle", "flowers"];
const imageSrc = (i) => `../lanyard/assets/lots/${i}.jpg`;
const paths = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  lots: "M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5",
  presentation: "M4 4h16v16H4z M4 15l5-5 4 4 3-3 4 4 M15 8h.1",
  attendees:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M19 8h3 M20.5 6.5v3",
  displays: "M3 4h18v12H3z M8 21h8 M12 16v5",
  notifications: "M3 4h18v13H8l-5 4z M7 8h10 M7 12h7",
  donations: "M12 21l-8-8C-3 5 7-1 12 7 17-1 27 5 20 13z",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  plus: "M12 5v14 M5 12h14",
  close: "M6 6l12 12 M6 18L18 6",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16 M17 17l4 4",
  preview: "M8 2h8v20H8z M11 18h2",
  check: "M5 12l4 4L19 6",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  category: "M3 4h7l11 11-6 6L3 9z M7 7h.1",
  duplicate: "M8 8h12v12H8z M4 16V4h12",
};
const icon = (n) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[n] || paths.lots}"/></svg>`;
const names = {
  overview: "Overview",
  lots: "Lots",
  categories: "Categories",
  windows: "Bidding windows",
  presentation: "Event presentation",
  attendees: "Attendees & access",
  displays: "Displays",
  notifications: "Notifications",
  donations: "Donations",
  readiness: "Readiness",
};
let current,
  openerKey = "",
  openedHere = false,
  noticeTimer,
  scrollPositions = {},
  storageOk = true;
const route = () => {
  const p = location.hash.slice(2).split("/");
  return {
    id: p[0] || db.ui.active,
    page: names[p[1]] ? p[1] : "lots",
    kind: p[2] === "edit" ? p[3] : null,
    item: p[4] || "new",
  };
};
const href = (page, id = current?.id || db.ui.active) => `#/${id}/${page}`;
const action = (text, kind, item = "new", cls = "btn light") =>
  `<button class="${cls}" data-action="open" data-kind="${kind}" data-item="${item}" data-key="${kind}-${item}">${text}</button>`;
const nav = (page, text, cls = "") =>
  `<a class="${cls}" href="${href(page)}">${text}</a>`;
const note = (text) => `<div class="note">${text}</div>`;
const tag = (text, ok = false) =>
  `<span class="status-tag${ok ? " ok" : ""}">${esc(text)}</span>`;
const header = (title, sub, buttons = "") =>
  `<div class="page-head"><div><h1 tabindex="-1">${title}</h1><p>${sub}</p></div><div class="head-actions">${buttons}</div></div>`;
const tabs = (page) =>
  `<nav class="workspace-tabs" aria-label="Auction workspace">${["lots", "categories", "windows"].map((n) => nav(n, names[n], n === page ? "on" : "")).join("")}</nav>`;
function toast(text) {
  document.querySelector("#notice").textContent = text;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(
    () => (document.querySelector("#notice").textContent = ""),
    4500,
  );
}
function write(fn, message) {
  if (!transact(fn)) {
    current = eventById(route().id);
    storageOk = false;
    const indicator = document.querySelector(".local-state");
    if (indicator) indicator.textContent = "Local save failed";
    toast(
      "Could not save locally. Your previous saved data is intact. Free storage and try again.",
    );
    return false;
  }
  storageOk = true;
  const indicator = document.querySelector(".local-state");
  if (indicator) indicator.innerHTML = '<i class="dot"></i>Saved locally';
  if (message) toast(message);
  return true;
}
function filter() {
  return (
    db.ui.filters[current.id] || {
      q: "",
      scope: "all",
      category: "",
      window: "",
      sort: "number",
    }
  );
}
function selected() {
  return db.ui.selection[current.id] || [];
}
function visibleLots() {
  const f = filter();
  let list = current.lots
    .map((l, i) => ({ ...l, number: i + 1 }))
    .filter(
      (l) =>
        (!f.q ||
          `${l.title} ${l.source} ${l.number}`
            .toLowerCase()
            .includes(f.q.toLowerCase())) &&
        (!f.category || l.category === f.category) &&
        (!f.window || l.window === f.window) &&
        (f.scope !== "unassigned" || !l.window) &&
        (f.scope !== "uncategorized" || !l.category) &&
        (f.scope !== "issues" || lotIssues(current, l).length),
    );
  if (f.sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
  if (f.sort === "opening") list.sort((a, b) => a.opening - b.opening);
  return list;
}
const opts = (list, value, placeholder) =>
  `<option value="">${placeholder}</option>${list
    .map((l) => {
      const id = typeof l === "string" ? l : l.id,
        name = typeof l === "string" ? l : l.name;
      return `<option value="${esc(id)}"${id === value ? " selected" : ""}>${esc(name)}</option>`;
    })
    .join("")}`;
const imgOptions = (value) =>
  opts(
    images.map((id) => ({
      id,
      name: {
        cabin: "Woodland cabin",
        coffee: "Coffee & conversation",
        dinner: "An evening together",
        ceramics: "Studio ceramics",
        bicycle: "City bicycle",
        flowers: "Seasonal flowers",
      }[id],
    })),
    value,
    "Choose a fixture image",
  );
const lotsFor = (w) => current.lots.filter((l) => l.window === w.id).length;
function windowMini() {
  return (
    current.windows
      .map(
        (w) =>
          `<div class="window-mini"><span class="mini-count">${lotsFor(w)} lots</span><b>${esc(w.name)}</b><small>${dateLabel(w.start)}</small><small>Closes ${dateLabel(w.end)}</small></div>`,
      )
      .join("") || "<p>No windows yet.</p>"
  );
}
function lotRows() {
  const list = visibleLots(),
    sel = selected();
  return list.length
    ? list
        .map(
          (l) =>
            `<tr class="lot-row${sel.includes(l.id) ? " selected" : ""}" data-lot="${l.id}"><td><input type="checkbox" data-select="${l.id}" aria-label="Select ${esc(l.title)}"${sel.includes(l.id) ? " checked" : ""}></td><td><div class="lot-title">${l.image ? `<img class="thumbnail" src="${imageSrc(l.image)}" alt="">` : `<span class="thumbnail">${icon("presentation")}</span>`}<div><button data-action="open" data-kind="lot" data-item="${l.id}" data-key="lot-${l.id}"><span class="lot-name">${esc(l.title)}</span></button><small>Lot ${String(l.number).padStart(2, "0")} ${lotIssues(current, l).length ? " · " + lotIssues(current, l).length + " to resolve" : ""}</small></div></div></td><td>${l.category ? `<span class="cell-text">${esc(l.category)}</span>` : '<span class="missing">Uncategorized</span>'}</td><td>${l.window ? `<span class="cell-text">${esc(current.windows.find((w) => w.id === l.window)?.name)}</span>` : '<span class="missing">Unassigned</span>'}</td><td class="amount">${money(l.opening)}<div class="row-meta">+ ${money(l.increment)}</div></td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5"><div class="empty"><h3>${current.lots.length ? "No matching lots" : "Your first lot starts here"}</h3><p>${current.lots.length ? "Try another search or clear the filters." : "Add an item, then organize it with a category and bidding window."}</p>${current.lots.length ? '<button class="btn" data-action="clear-filters">Clear filters</button>' : action("Add a lot", "lot", "new", "btn primary")}</div></td></tr>`;
}
function bulkBar() {
  return selected().length
    ? `<div class="bulk"><span class="count">${selected().length} selected</span><label class="sr" for="bulk-category">Bulk category</label><select id="bulk-category">${opts(current.categories, "", "Set category…")}</select><button class="btn small" data-action="bulk-category">Categorize</button><label class="sr" for="bulk-window">Bulk bidding window</label><select id="bulk-window">${opts(current.windows, "", "Assign window…")}</select><button class="btn primary small" data-action="bulk-window">Assign</button><button class="btn small" data-action="clear-selection" aria-label="Clear selection">${icon("close")}</button></div>`
    : "";
}
function lotsPage() {
  const f = filter();
  return `${header("Lots", `${current.lots.length} ${current.lots.length === 1 ? "item" : "items"} · Keep the catalog moving.`, action(icon("plus") + " Add lot", "lot", "new", "btn primary"))}${tabs("lots")}<div class="split"><div><div class="filter-chips">${[
    ["all", "All lots"],
    [
      "unassigned",
      `Unassigned · ${current.lots.filter((l) => !l.window).length}`,
    ],
    [
      "uncategorized",
      `Uncategorized · ${current.lots.filter((l) => !l.category).length}`,
    ],
    [
      "issues",
      `Needs attention · ${current.lots.filter((l) => lotIssues(current, l).length).length}`,
    ],
  ]
    .map(
      ([id, text]) =>
        `<button class="chip${f.scope === id ? " on" : ""}" data-scope="${id}" aria-pressed="${f.scope === id}">${text}</button>`,
    )
    .join(
      "",
    )}</div><div class="table-panel"><div class="toolbar"><label class="search">${icon("search")}<span class="sr">Search lots</span><input id="search" type="search" value="${esc(f.q)}" placeholder="Search lots or contributors"></label><label class="sr" for="category-filter">Filter category</label><select id="category-filter">${opts(current.categories, f.category, "All categories")}</select><label class="sr" for="window-filter">Filter bidding window</label><select id="window-filter">${opts(current.windows, f.window, "All windows")}</select><label class="sr" for="sort-lots">Sort lots</label><select id="sort-lots"><option value="number"${f.sort === "number" ? " selected" : ""}>Lot order</option><option value="title"${f.sort === "title" ? " selected" : ""}>Title A–Z</option><option value="opening"${f.sort === "opening" ? " selected" : ""}>Opening bid</option></select></div><div id="bulk">${bulkBar()}</div><div class="table-scroll"><table><thead><tr><th><input id="select-visible" type="checkbox" aria-label="Select visible lots"></th><th class="item-col">Lot</th><th class="category-col">Category</th><th class="window-col">Bidding window</th><th class="amount-col">Opening / step</th></tr></thead><tbody id="lot-rows">${lotRows()}</tbody></table></div><div class="table-footer"><span id="lot-count">${visibleLots().length} of ${current.lots.length} lots</span><span>USD · prototype fixture</span></div></div><p class="fine" style="margin-top:14px">Select rows to categorize or assign a bidding window in one step.</p></div><aside class="context"><div class="side-note"><div class="section-heading"><h3>Bidding windows</h3>${nav("windows", icon("arrow"), "text-btn")}</div>${windowMini()}${action("+ New window", "window", "new", "text-btn")}</div>${note("<b>One window per lot</b><p>Provisional for this exploration. Assigning a new window replaces the previous draft assignment.</p><p>Relisting and rescheduling after approval need a separate decision.</p>")}<div class="side-note section-gap"><h3>Categories ≠ windows</h3><p>Categories help bidders browse. Windows set when assigned lots can receive bids.</p>${nav("categories", "Manage categories " + icon("arrow"), "text-btn")}</div></aside></div>`;
}
function categoriesPage() {
  return `${header("Categories", "Organize browsing. Bidding times live in windows.", action(icon("plus") + " New category", "category", "new", "btn primary"))}${tabs("categories")}<div class="split"><div class="section-list">${current.categories.length ? current.categories.map((c) => `<div class="section-row"><span class="number">${String(current.lots.filter((l) => l.category === c).length).padStart(2, "0")}</span><div class="row-content"><h3>${esc(c)}</h3><p>${current.lots.filter((l) => l.category === c).length} lots · browsing category</p></div><div class="list-actions"><button class="btn small" data-action="category-lots" data-value="${esc(c)}">View lots</button>${action("Rename", "category", encodeURIComponent(c), "btn small light")}</div></div>`).join("") : `<div class="empty"><h3>Give your catalog a little order.</h3><p>Add a category, then assign lots in bulk.</p>${action("New category", "category", "new", "btn primary")}</div>`}<div class="section-row"><div class="row-content"><h3>Uncategorized</h3><p>${current.lots.filter((l) => !l.category).length} lots are still waiting for a category.</p></div><button class="btn small" data-action="issue-lots" data-value="uncategorized">Find lots</button></div></div><aside class="context">${note("<b>Keep categories familiar.</b><p>Use names like “Getaways” or “Food & drink”. The same category may span several bidding windows.</p>")}</aside></div>`;
}
function windowsPage() {
  return `${header("Bidding windows", "Opening and closing times, separate from the physical event.", action(icon("plus") + " New window", "window", "new", "btn primary"))}${tabs("windows")}<div class="section-list">${current.windows.map((w, i) => `<div class="section-row"><span class="number">${String(i + 1).padStart(2, "0")}</span><div class="row-content"><h3>${esc(w.name)}</h3><p>${dateLabel(w.start)} → ${dateLabel(w.end)}</p><p>${esc(current.timezone)} · ${lotsFor(w)} assigned lots</p></div><div class="list-actions"><button class="btn small" data-action="window-lots" data-value="${w.id}">View ${lotsFor(w)} lots</button>${action("Edit draft", "window", w.id, "btn small light")}</div></div>`).join("") || `<div class="empty"><h3>When can bidders bid?</h3><p>Create your first opening and closing window, then assign lots.</p>${action("New window", "window", "new", "btn primary")}</div>`}<div class="section-row"><div class="row-content"><h3>Unassigned lots</h3><p>${current.lots.filter((l) => !l.window).length} lots need a window. Find them and assign in bulk.</p></div><button class="btn" data-action="issue-lots" data-value="unassigned">Assign lots</button></div></div><div class="section-gap">${note("<b>Prototype assumption: one bidding window per lot.</b><p>These are editable draft times. No approval, relisting, replacement catalog, or post-approval rescheduling policy is implemented.</p><p>Current staging hides the catalog until bidding opens. Visibility of lots in later windows is an open decision; the draft preview shows all lots for staff review.</p>")}</div>`;
}
function overviewPage() {
  const passed = checks(current).filter((c) => c.ok).length;
  return `${header("Event overview", "Your workspace for " + esc(current.name) + ".", action("Edit details", "presentation", "new", "btn light") + nav("lots", "Manage lots " + icon("arrow"), "btn primary"))}<div class="summary-strip"><div><span class="eyebrow">Lots</span><b>${current.lots.length}</b></div><div><span class="eyebrow">Categories</span><b>${current.categories.length}</b></div><div><span class="eyebrow">Bidding windows</span><b>${current.windows.length}</b></div><div><span class="eyebrow">Setup checks</span><b>${passed}<span class="muted" style="font-size:18px"> / 5</span></b></div></div><div class="overview-grid"><section><div class="section-heading"><h2>Event presentation</h2>${tag("Draft")}</div><div class="event-presentation">${current.heading ? `<img src="${imageSrc(current.heading)}" alt="Event heading image">` : '<div class="event-image-placeholder">Add a heading image</div>'}<div class="presentation-copy"><span class="eyebrow">Northline Business Exchange presents</span><h2 style="margin-top:7px">${esc(current.name)}</h2><p>${esc(current.welcome || "Write a welcome for your guests.")}</p><p class="fine">${dateLabel(current.date)} · ${esc(current.location || "Venue not set")}</p>${action("Edit welcome & details", "presentation", "new", "btn")}</div></div></section><section><h2>Pick up the work</h2>${nav("lots", `<div><strong>Organize the catalog</strong><p>${current.lots.length} lots · ${current.lots.filter((l) => !l.window).length} without a bidding window</p></div>${icon("arrow")}`, "work-row")}${nav("windows", `<div><strong>Set the bidding windows</strong><p>${current.windows.length} windows · draft opening and closing times</p></div>${icon("arrow")}`, "work-row")}${nav("attendees", `<div><strong>Share the event link</strong><p>One shared QR for your sign or iPad</p></div>${icon("arrow")}`, "work-row")}${nav("displays", `<div><strong>Prepare the room displays</strong><p>Preview draft TV and projector views</p></div>${icon("arrow")}`, "work-row")}<div class="section-gap">${note(`<b>${passed === 5 ? "Content setup is complete" : `${5 - passed} setup checks need attention`}</b><p>${passed === 5 ? "Review the draft and record a local readiness review." : "Fix missing content and assignments when you are ready."}</p>${nav("readiness", "Review readiness " + icon("arrow"), "text-btn")}`)}</div></section></div>`;
}
function presentationPage() {
  return `${header("Event presentation", "The welcome, physical event details, and optional sponsors.", action("Edit welcome & details", "presentation", "new", "btn primary"))}<div class="detail-grid"><div><div class="event-presentation">${current.heading ? `<img src="${imageSrc(current.heading)}" alt="Event heading image">` : '<div class="event-image-placeholder">No heading image yet</div>'}<div class="presentation-copy"><span class="eyebrow">Welcome page · draft</span><h2 style="margin-top:8px">${esc(current.name)}</h2><p>${esc(current.welcome || "No welcome written yet.")}</p></div></div><div class="section-gap"><div class="section-heading"><h2>Sponsors <small>Optional</small></h2>${action("+ Add sponsor", "sponsor", "new", "text-btn")}</div>${current.sponsors.map((s) => `<div class="work-row"><span style="width:34px;height:34px;background:var(--paper-2);border:1px solid var(--line);border-radius:8px;display:grid;place-items:center;font-weight:650">${esc(s.slice(0, 1))}</span><strong>${esc(s)}</strong></div>`).join("") || '<p class="muted">Add sponsor names to the welcome. This is not a setup requirement.</p>'}</div></div><div><section class="detail-sheet"><h2>Physical event</h2><dl class="facts"><div class="fact"><dt>Date & time</dt><dd>${dateLabel(current.date)}</dd></div><div class="fact"><dt>Venue</dt><dd>${esc(current.location || "Not set")}</dd></div><div class="fact"><dt>Timezone</dt><dd>${esc(current.timezone)}</dd></div></dl></section><div class="section-gap">${note("<b>The event time is not a bidding window.</b><p>Guests can gather at a different time from when bidding opens or closes. Assign lots to windows in the auction workspace.</p>")}${nav("windows", "Manage bidding windows " + icon("arrow"), "text-btn")}</div></div></div>`;
}
function sharedLink() {
  return `${location.origin}/event-studio/preview.html?event=${encodeURIComponent(current.id)}#welcome`;
}
function qr() {
  const q = qrcode(0, "M");
  q.addData(sharedLink());
  q.make();
  return q.createSvgTag({ cellSize: 5, margin: 4, scalable: true });
}
function attendeesPage() {
  return `${header("Attendees & access", "One shared event link for the room.")}<div class="detail-grid"><section class="qr-card"><span class="eyebrow">Shared event link · prototype</span><h2 style="margin-top:8px">${esc(current.name)}</h2>${qr()}<p class="muted">Scan to open the event welcome.</p><span class="link-code">${esc(sharedLink())}</span><div style="display:flex;justify-content:center;gap:10px"><button class="btn primary" data-action="print-qr">Print QR</button><button class="btn" data-action="present-qr">Present QR</button></div></section><section><h2>A link, not an admission credential.</h2><p class="welcome-copy section-gap">Print this QR on a sign or present the same QR on an iPad. Everyone receives the same event link. It does not identify a person, admit a bidder, or grant bidding authority.</p>${note("<b>Local demo destination</b><p>The QR encodes this loopback preview. It works in this browser with its local draft data; an iPad cannot access this computer’s loopback address. Hosted link sharing and admission are simulated.</p>")}<div class="section-gap"><h3>Admission still needs a decision</h3><p class="welcome-copy" style="margin-top:12px">Phone verification, invitation admission, and organization/business authority remain open. There are no individual passes to issue in this exploration.</p></div><button class="text-btn" data-action="copy-link">Copy demo link ${icon("arrow")}</button></section></div>`;
}
function displayStage(config) {
  return `<div class="display-stage"><h2>${esc(config.title || current.name)}</h2><p>Northline Business Exchange · Display simulation</p><div class="display-lots ${config.layout === "list" ? "list" : ""}">${current.lots
    .slice(0, 3)
    .map(
      (l) =>
        `<div class="display-lot">${l.image ? `<img src="${imageSrc(l.image)}" alt="">` : ""}<b>${esc(l.title)}</b>${config.showAmounts ? `<span>${money(l.opening)}</span>` : ""}</div>`,
    )
    .join(
      "",
    )}</div><div class="display-footer">${esc(config.footer)}</div></div>`;
}
function displaysPage() {
  const d = current.display;
  return `${header("Displays", "Prepare TV and projector views. Preview changes before applying.")}<div class="detail-grid"><section class="detail-sheet"><h2>Display draft</h2><form id="display-form" class="form-stack"><label class="form-label">Display heading<input name="title" maxlength="80" required value="${esc(d.draft.title)}"></label><label class="form-label">Layout<select name="layout"><option value="grid"${d.draft.layout === "grid" ? " selected" : ""}>Lot grid</option><option value="list"${d.draft.layout === "list" ? " selected" : ""}>Compact list</option></select></label><label class="form-label">Footer message<input name="footer" maxlength="120" value="${esc(d.draft.footer)}"></label><label class="checkbox-label"><input type="checkbox" name="showAmounts"${d.draft.showAmounts ? " checked" : ""}>Show opening bids</label><button class="btn primary" type="submit">Apply to simulated display</button><p class="fine">Draft edits persist locally. Apply updates only the simulated display below. No screen is connected.</p></form></section><section><div class="section-heading"><h2>Live draft preview</h2>${tag("Draft")}</div><div id="draft-display">${displayStage(d.draft)}</div><div class="section-gap"><div class="section-heading"><h3>Applied display</h3>${tag(d.applied ? "Applied locally" : "Not applied", !!d.applied)}</div><div id="applied-display">${d.applied ? displayStage(d.applied) : note("No display has been applied. Change the draft above, inspect its preview, then apply it locally.")}</div></div></section></div>`;
}
function notificationsPage() {
  const s = current.sms,
    ready = s.sender && s.consent && s.test === "passed";
  return `${header("Notifications", "SMS readiness for this event. Every operation here is simulated.")}<div class="detail-grid"><section class="detail-sheet"><h2>Prepare SMS</h2><p class="muted">Review a sender and consent approach before planning any messages.</p><div class="sms-options"><label class="checkbox-label"><input type="checkbox" data-sms="sender"${s.sender ? " checked" : ""}>Demo sender configuration reviewed</label><label class="checkbox-label"><input type="checkbox" data-sms="consent"${s.consent ? " checked" : ""}>Consent & opt-out approach reviewed</label></div><div class="form-stack"><label class="form-label">Simulated test outcome<select id="sms-outcome"><option value="passed">Pass fixture readiness check</option><option value="failed">Simulate provider failure</option></select></label><button class="btn primary" data-action="sms-test"${s.test === "pending" ? " disabled" : ""}>${s.test === "pending" ? "Checking fixture…" : "Run simulated readiness test"}</button></div><div class="sms-state"><h3>${ready ? "Demo readiness complete" : s.test === "failed" ? "Simulated test failed" : s.test === "pending" ? "Checking fixture readiness" : s.test === "interrupted" ? "Test interrupted" : "SMS is not ready"}</h3><p>${ready ? "The fixture check passed. No provider connection or delivery was verified." : s.test === "failed" ? "Nothing was sent. Check the simulated configuration and run again." : s.test === "pending" ? "No message is being sent." : s.test === "interrupted" ? "Reload interrupted the simulated check. Run it again; no message was sent." : "Review both items and run the fixture check."}</p></div></section><section>${note("<b>No texts are sent.</b><p>This prototype has no phone numbers, provider credentials, recipients, or send action. Readiness does not prove carrier delivery.</p>")}<div class="section-gap"><h2>What still needs defining</h2><div class="work-row"><div><strong>Sender & provider</strong><p>Registration, ownership, credentials, and failures.</p></div></div><div class="work-row"><div><strong>Consent & message purpose</strong><p>Opt-in, opt-out, recipients, and notification triggers.</p></div></div><div class="work-row"><div><strong>Delivery evidence</strong><p>Provider acceptance and recipient delivery are separate states.</p></div></div></div></section></div>`;
}
function donationsPage() {
  const d = current.donation;
  return `${header("Donations", "A separate destination for giving, with no money movement.")}<div class="detail-grid"><section class="detail-sheet"><h2>Donation presentation</h2><form id="donation-form" class="form-stack"><label class="checkbox-label"><input name="enabled" type="checkbox"${d.enabled ? " checked" : ""}>Show a giving information section in the draft welcome</label><label class="form-label">Giving information<textarea name="description" maxlength="1000" placeholder="Explain the idea for guests. No payment details.">${esc(d.description)}</textarea></label><button class="btn primary" type="submit">Save donation presentation</button><p class="fine">This saves wording only. There is no payment amount, checkout, transfer, or receipt.</p></form></section><section>${note("<b>Giving is not bidding.</b><p>Recipient, currency, payment processor, fee treatment, and receipts are undecided. Donation setup is not a content readiness requirement.</p>")}<h2 class="section-gap">Draft guest information</h2><p id="donation-preview" class="welcome-copy" style="margin-top:15px">${esc(d.enabled ? d.description || "Giving information has not been written yet." : "Giving information is hidden in the welcome.")}</p></section></div>`;
}
function readinessPage() {
  const list = checks(current),
    ready = list.every((c) => c.ok),
    review = current.review;
  return `${header("Review readiness", "Content checks for this draft. Nothing is published or approved.", tag(`${list.filter((c) => c.ok).length} of 5 complete`, ready))}<div class="split"><section><div class="section-list">${list.map((c) => `<div class="check-row"><span class="check-state${c.ok ? " ok" : ""}">${c.ok ? icon("check") : "!"}</span><div class="content"><b>${c.title}</b><p>${esc(c.detail)}</p></div><button class="btn small light" data-action="resolve" data-page="${c.to}" data-filter="${c.ok ? "all" : c.filter || "issues"}">${c.ok ? "Inspect" : "Resolve"} ${icon("arrow")}</button></div>`).join("")}</div><div class="review-bar"><button class="btn primary" data-action="review"${ready ? "" : " disabled"}>Record local readiness review</button><p>${ready ? "Content checks pass. A local review records the draft revision for this exploration." : "Resolve the incomplete checks above, then review this draft."}</p></div><div class="section-gap">${review ? note(`<b>${review.revision === current.revision ? "Reviewed locally · current draft" : "Draft changed since the last review"}</b><p>Revision ${review.revision} reviewed ${esc(new Date(review.at).toLocaleString())}. Current draft revision ${current.revision}. This is not catalog approval or release acceptance.</p>`) : note("No local review recorded yet. Content readiness and launch authority are separate.")}</div></section><aside class="context"><div class="side-note"><h3>Beyond content setup</h3><p>Access/admission rules, SMS provider readiness, catalog visibility, currency and auction rules, connected display behavior, and release verification remain separate decisions.</p></div>${action("Inspect bidder preview", "preview", "new", "btn light")}<p class="fine" style="margin-top:15px">Sponsors and donation presentation are optional. They do not block this content checklist.</p></aside></div>`;
}
const pages = {
  lots: lotsPage,
  categories: categoriesPage,
  windows: windowsPage,
  overview: overviewPage,
  presentation: presentationPage,
  attendees: attendeesPage,
  displays: displaysPage,
  notifications: notificationsPage,
  donations: donationsPage,
  readiness: readinessPage,
};
function render() {
  const r = route();
  current = eventById(r.id);
  if (!current) {
    location.replace(href("lots", db.events[0].id));
    return;
  }
  const old = document.querySelector("#main");
  if (old && app.dataset.route)
    scrollPositions[app.dataset.route] = old.scrollTop;
  const done = checks(current).filter((c) => c.ok).length;
  app.dataset.route = r.id + "/" + r.page;
  app.innerHTML = `<div class="app"><aside class="sidebar"><a class="brand" href="${href("overview")}">BidZizi</a><div class="org"><span class="monogram">N</span><div><b>Northline Exchange</b><small>Organization workspace</small></div></div><label class="event-selector"><span class="eyebrow">Current event</span><select id="event-switch" aria-label="Current event">${db.events.map((e) => `<option value="${e.id}"${e.id === current.id ? " selected" : ""}>${esc(e.name)}</option>`).join("")}</select><button class="new-event" data-action="open" data-kind="event" data-key="event-new">+ Create event</button></label><nav aria-label="Event Studio"><a class="nav-link${r.page === "overview" ? " on" : ""}" href="${href("overview")}">${icon("overview")}Overview</a><a aria-label="Auction workspace" class="nav-link${["lots", "categories", "windows"].includes(r.page) ? " on" : ""}" href="${href("lots")}">${icon("lots")}Auction workspace<span class="nav-count">${current.lots.length}</span></a><div class="nav-group">Event experience</div>${["presentation", "attendees", "displays", "notifications", "donations"].map((n) => `<a class="nav-link${r.page === n ? " on" : ""}" href="${href(n)}">${icon(n)}${{ presentation: "Presentation", attendees: "Attendees & access" }[n] || names[n]}</a>`).join("")}</nav><div class="sidebar-bottom"><a class="progress-link" href="${href("readiness")}"><div class="progress-line"><span>Setup & readiness</span><span>${done}/5 ${icon("arrow")}</span></div><div class="progress"><span style="width:${done * 20}%"></span></div><span class="fine">${done === 5 ? "Ready for local review" : `${5 - done} checks to resolve`}</span></a><p class="prototype-label"><b>Interactive prototype</b><br>Fictional data · this browser only<br>No publishing, texts, or payments</p></div></aside><div class="work"><header class="topbar"><div class="crumb"><strong>${esc(current.name)}</strong><span class="divider">/</span><span>Event Studio</span>${tag("Draft")}</div><div class="header-actions"><span class="local-state">${storageOk ? '<i class="dot"></i>Saved locally' : "Local save failed"}</span>${nav("readiness", "Readiness", "btn small light")}${action(icon("preview") + " Bidder preview", "preview", "new", "btn small")}</div></header><main id="main" class="workspace" tabindex="-1">${pages[r.page]()}</main></div></div>`;
  document.querySelector("#main").scrollTop =
    scrollPositions[app.dataset.route] || 0;
  document.title = `${names[r.page]} · ${current.name} · BidZizi`;
  if (r.page === "lots") syncSelection();
  if (r.kind) renderEditor(r);
  else {
    if (dialog.open) dialog.close();
    if (openerKey) {
      document.querySelector(`[data-key="${CSS.escape(openerKey)}"]`)?.focus();
      openerKey = "";
    }
    openedHere = false;
  }
}
function updateFilters(values) {
  write(() => {
    db.ui.filters[current.id] = { ...filter(), ...values };
  });
}
function refreshRows() {
  document.querySelector("#lot-rows").innerHTML = lotRows();
  document.querySelector("#bulk").innerHTML = bulkBar();
  document.querySelector("#lot-count").textContent =
    `${visibleLots().length} of ${current.lots.length} lots`;
  syncSelection();
}
function syncSelection() {
  const all = document.querySelector("#select-visible"),
    list = visibleLots(),
    s = selected();
  if (all) {
    all.checked = list.length > 0 && list.every((l) => s.includes(l.id));
    all.indeterminate = list.some((l) => s.includes(l.id)) && !all.checked;
  }
}
function openEditor(kind, item = "new", key = "") {
  openerKey = key;
  openedHere = true;
  location.hash = href(route().page) + `/edit/${kind}/${item}`;
}
function closeEditor() {
  if (openedHere) {
    history.back();
  } else {
    location.replace(href(route().page));
  }
}
const draftKey = (r) => `${r.id}:${r.kind}:${r.item}`;
function field(label, name, value = "", type = "text", extra = "") {
  return `<label class="form-label">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
}
function selectField(label, name, options) {
  return `<label class="form-label">${label}<select name="${name}">${options}</select></label>`;
}
function textField(label, name, value = "", extra = "") {
  return `<label class="form-label">${label}<textarea name="${name}" ${extra}>${esc(value)}</textarea></label>`;
}
function initialDraft(r) {
  if (r.kind === "event") return { name: "" };
  if (r.kind === "presentation") return { ...current };
  if (r.kind === "lot") {
    const l = current.lots.find((l) => l.id === r.item);
    return l
      ? {
          ...l,
          opening: (l.opening / 100).toString(),
          increment: (l.increment / 100).toString(),
        }
      : {
          title: "",
          description: "",
          image: "",
          category: "",
          window: "",
          opening: "100",
          increment: "25",
          source: "Northline Business Exchange",
        };
  }
  if (r.kind === "window")
    return (
      current.windows.find((w) => w.id === r.item) || {
        name: "",
        start: "2026-12-12T17:00",
        end: "2026-12-12T18:00",
      }
    );
  if (r.kind === "category")
    return { name: r.item === "new" ? "" : decodeURIComponent(r.item) };
  if (r.kind === "sponsor") return { name: "" };
  return {};
}
function renderEditor(r) {
  const d = db.drafts[draftKey(r)] || initialDraft(r);
  dialog.className = r.kind === "preview" ? "preview-dialog" : "";
  let content = "",
    title = "",
    footer = "",
    wide = false;
  if (r.kind === "preview") {
    title = "Mobile bidder preview";
    wide = true;
    content = `<div class="preview-layout"><div class="preview-info"><h3>${esc(current.name)}</h3><p>Interactive draft preview using Design A’s actual lot-list and lot-detail renderers.</p>${note("<b>Staff draft view · simulation</b><p>All draft lots are visible here, including unassigned lots. This does not represent catalog visibility or admission.</p><p>Current staging hides the catalog until bidding opens. Later-window visibility remains undecided.</p>")}<div class="section-list">${windowMini()}</div><p class="section-gap">Browse categories, open a lot, and go back. Bid actions are disabled; this preview places nothing.</p></div><iframe title="Mobile bidder draft preview" src="preview.html?event=${current.id}#lots"></iframe></div>`;
  }
  if (r.kind === "qr") {
    title = "Shared event-link QR";
    content = `<div class="qr-card"><h2>${esc(current.name)}</h2>${qr()}<p>One link for everyone. Not an admission credential.</p><span class="link-code">${esc(sharedLink())}</span><p class="fine">Local prototype · cannot be opened from another device.</p></div>`;
    footer = '<button class="btn" data-action="print-qr">Print QR</button>';
  }
  if (r.kind === "event") {
    title = "Create an event";
    content =
      field(
        "Event name",
        "name",
        d.name,
        "text",
        'required maxlength="80" autofocus',
      ) +
      note(
        "Created inside Northline Business Exchange. Event data stays separate in this browser.",
      );
  }
  if (r.kind === "presentation") {
    title = "Welcome & event details";
    content =
      field("Event name", "name", d.name, "text", 'required maxlength="80"') +
      selectField("Heading image", "heading", imgOptions(d.heading)) +
      `<img id="heading-preview" class="editor-img" src="${imageSrc(d.heading || "dinner")}" alt="Selected fixture heading image">` +
      textField("Welcome message", "welcome", d.welcome, 'maxlength="2000"') +
      `<div class="form-grid">${field("Physical event date & time", "date", d.date, "datetime-local")}${field("Venue / location", "location", d.location, "text", 'maxlength="150"')}</div>` +
      selectField(
        "Event timezone",
        "timezone",
        `<option value="America/Los_Angeles"${d.timezone === "America/Los_Angeles" ? " selected" : ""}>Pacific · America/Los_Angeles</option><option value="America/New_York"${d.timezone === "America/New_York" ? " selected" : ""}>Eastern · America/New_York</option>`,
      ) +
      note(
        "This is when guests gather. Bidding windows are configured separately. Times in this prototype are wall-clock fixtures, not scheduling authority.",
      );
  }
  if (r.kind === "lot") {
    title = r.item === "new" ? "Add a lot" : "Edit lot";
    content =
      field("Lot title", "title", d.title, "text", 'required maxlength="200"') +
      textField(
        "Description",
        "description",
        d.description,
        'maxlength="3000"',
      ) +
      selectField("Lot image", "image", imgOptions(d.image)) +
      field("Item contributor", "source", d.source, "text", 'maxlength="100"') +
      `<div class="form-grid">${selectField("Category", "category", opts(current.categories, d.category, "Uncategorized"))}${selectField("Bidding window", "window", opts(current.windows, d.window, "Unassigned"))}</div><div class="form-grid">${field("Opening bid · USD fixture", "opening", d.opening, "text", 'required inputmode="decimal"')}${field("Bid increment · USD fixture", "increment", d.increment, "text", 'required inputmode="decimal"')}</div><div id="increment-example" class="increment-example">${incrementExample(d)}</div>` +
      note(
        "Provisional: one window per lot. Saving replaces only the draft assignment; no relisting or post-approval policy is implied.",
      );
    footer =
      r.item !== "new"
        ? `<button class="text-btn quiet" data-action="duplicate" data-item="${r.item}">${icon("duplicate")} Duplicate lot</button>`
        : "";
  }
  if (r.kind === "window") {
    title = r.item === "new" ? "New bidding window" : "Edit bidding window";
    content =
      field("Window name", "name", d.name, "text", 'required maxlength="70"') +
      field("Opens", "start", d.start, "datetime-local", "required") +
      field("Closes", "end", d.end, "datetime-local", "required") +
      note(
        `<b>${esc(current.timezone)}</b><p>Closing must follow opening. Windows may overlap; overlap policy remains open. These are draft fixture times only.</p>`,
      );
  }
  if (r.kind === "category") {
    title = r.item === "new" ? "New category" : "Rename category";
    content =
      field(
        "Category name",
        "name",
        d.name,
        "text",
        'required maxlength="60"',
      ) +
      note(
        "Renaming updates category labels on assigned draft lots. It does not change bidding windows.",
      );
  }
  if (r.kind === "sponsor") {
    title = "Add event sponsor";
    content =
      field(
        "Sponsor name",
        "name",
        d.name,
        "text",
        'required maxlength="100"',
      ) +
      note(
        "Optional welcome-page presentation. Sponsorship does not give bidding authority or become a required setup check.",
      );
  }
  dialog.innerHTML = `<div class="editor-shell"><header class="editor-head"><div><p class="eyebrow">${wide ? "Draft preview" : "Event Studio · local draft"}</p><h2 id="editor-title">${title}</h2></div><button class="close" data-action="close" aria-label="Close editor">${icon("close")}</button></header>${wide ? content : r.kind === "qr" ? `<div class="editor-body">${content}</div>` : `<div class="editor-body"><form id="edit-form" class="form-stack"><div id="form-error" class="error" role="alert"></div>${content}</form></div>`}<footer class="editor-footer">${wide ? "<small>Simulation · no bids or messages</small>" : r.kind === "qr" ? footer : `<div>${footer || "<small>Edits kept locally as a draft.</small>"}<button class="text-btn quiet" data-action="discard-draft" style="display:block;font-size:12px">Discard editor draft</button></div><button class="btn primary" form="edit-form" type="submit">${r.kind === "event" ? "Create event" : r.kind === "lot" && r.item === "new" ? "Add lot" : "Save changes"}</button>`}${wide ? '<button class="btn" data-action="close">Close preview</button>' : ""}</footer></div>`;
  if (!dialog.open) dialog.showModal();
  setTimeout(
    () =>
      (
        dialog.querySelector(
          "#edit-form input, #edit-form select, #edit-form textarea",
        ) || dialog.querySelector("button")
      )?.focus(),
    0,
  );
}
function cents(text) {
  const s = String(text).trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return null;
  const [a, b = ""] = s.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  return n > 0 && Number.isSafeInteger(n) ? n : null;
}
function incrementExample(d) {
  const open = cents(d.opening),
    step = cents(d.increment);
  return open && step
    ? `<b>How the increment works</b><br>The first eligible bid is ${money(open)}. If the current bid is ${money(open)}, the next eligible bid is <b>${money(open + step)}</b> (${money(open)} + ${money(step)}).`
    : "Enter positive amounts with up to two decimal places to see the next eligible bid.";
}
function error(text) {
  document.querySelector("#form-error").textContent = text;
}
function saveEditor(form) {
  const r = route(),
    d = Object.fromEntries(new FormData(form));
  for (const k of Object.keys(d)) d[k] = d[k].trim();
  let newId;
  if (
    ["event", "category", "sponsor", "window", "presentation"].includes(
      r.kind,
    ) &&
    !d.name
  )
    return error("Enter a name before saving.");
  if (r.kind === "lot" && !d.title)
    return error("Enter a lot title before saving.");
  if (
    r.kind === "event" &&
    db.events.some((e) => e.name.toLowerCase() === d.name.toLowerCase())
  )
    return error("An event with this name already exists in the organization.");
  if (r.kind === "lot") {
    d.opening = cents(d.opening);
    d.increment = cents(d.increment);
    if (!d.opening || !d.increment)
      return error(
        "Opening bid and increment must be positive USD fixture amounts, with at most two decimal places.",
      );
  }
  if (r.kind === "window") {
    if (!validWindow(d))
      return error("Closing time must be after opening time.");
    if (
      current.windows.some(
        (w) => w.id !== r.item && w.name.toLowerCase() === d.name.toLowerCase(),
      )
    )
      return error("Use a distinct name for each bidding window.");
  }
  if (r.kind === "category") {
    const old = r.item === "new" ? "" : decodeURIComponent(r.item);
    if (
      current.categories.some(
        (c) => c !== old && c.toLowerCase() === d.name.toLowerCase(),
      )
    )
      return error("This category already exists.");
  }
  if (
    r.kind === "sponsor" &&
    current.sponsors.some((s) => s.toLowerCase() === d.name.toLowerCase())
  )
    return error("This sponsor is already listed.");
  const ok = write(
    () => {
      if (r.kind === "event") {
        const e = emptyEvent(d.name);
        newId = e.id;
        db.events.push(e);
        db.ui.active = e.id;
      } else {
        if (r.kind === "presentation")
          Object.assign(current, {
            name: d.name,
            heading: d.heading,
            welcome: d.welcome,
            date: d.date,
            location: d.location,
            timezone: d.timezone,
          });
        if (r.kind === "lot") {
          if (r.item === "new")
            current.lots.push({ ...d, id: uid(), logo: "earth" });
          else
            Object.assign(
              current.lots.find((l) => l.id === r.item),
              d,
            );
        }
        if (r.kind === "window") {
          if (r.item === "new") current.windows.push({ ...d, id: uid() });
          else
            Object.assign(
              current.windows.find((w) => w.id === r.item),
              d,
            );
        }
        if (r.kind === "category") {
          if (r.item === "new") current.categories.push(d.name);
          else {
            const old = decodeURIComponent(r.item);
            current.categories = current.categories.map((c) =>
              c === old ? d.name : c,
            );
            current.lots.forEach((l) => {
              if (l.category === old) l.category = d.name;
            });
          }
        }
        if (r.kind === "sponsor") current.sponsors.push(d.name);
        touch(current);
      }
      delete db.drafts[draftKey(r)];
    },
    r.kind === "event" ? "Event created locally." : "Changes saved locally.",
  );
  if (!ok) return;
  form
    .querySelectorAll("input,select,textarea")
    .forEach((el) => (el.disabled = true));
  dialog.querySelector("[type=submit]")?.setAttribute("disabled", "");
  if (newId) {
    openedHere = false;
    location.replace(href("overview", newId));
  } else closeEditor();
}
app.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    updateFilters({ q: e.target.value });
    refreshRows();
  }
  if (e.target.closest("#display-form")) {
    const f = e.target.closest("form"),
      d = Object.fromEntries(new FormData(f));
    d.showAmounts = f.elements.showAmounts.checked;
    write(() => {
      current.display.draft = d;
    });
    document.querySelector("#draft-display").innerHTML = displayStage(
      current.display.draft,
    );
  }
});
app.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "event-switch") {
    if (
      write(() => {
        db.ui.active = t.value;
      })
    )
      location.hash = href(route().page, t.value);
  }
  if (t.id === "category-filter") {
    updateFilters({ category: t.value });
    refreshRows();
  }
  if (t.id === "window-filter") {
    updateFilters({ window: t.value });
    refreshRows();
  }
  if (t.id === "sort-lots") {
    updateFilters({ sort: t.value });
    refreshRows();
  }
  if (t.dataset.select) {
    write(() => {
      const s = new Set(selected());
      t.checked ? s.add(t.dataset.select) : s.delete(t.dataset.select);
      db.ui.selection[current.id] = [...s];
    });
    refreshRows();
  }
  if (t.id === "select-visible") {
    write(() => {
      const s = new Set(selected());
      visibleLots().forEach((l) => (t.checked ? s.add(l.id) : s.delete(l.id)));
      db.ui.selection[current.id] = [...s];
    });
    refreshRows();
  }
  if (t.dataset.sms) {
    write(() => {
      current.sms[t.dataset.sms] = t.checked;
      current.sms.test = "untested";
    });
  }
});
function handleClick(e) {
  const b = e.target.closest("[data-action],[data-scope]");
  if (!b) return;
  const a = b.dataset.action;
  if (b.dataset.scope) {
    updateFilters({ scope: b.dataset.scope, window: "" });
    render();
    return;
  }
  if (a === "open")
    openEditor(b.dataset.kind, b.dataset.item || "new", b.dataset.key);
  if (a === "close") closeEditor();
  if (a === "discard-draft") {
    if (
      write(
        () => delete db.drafts[draftKey(route())],
        "Editor draft discarded.",
      )
    )
      closeEditor();
  }
  if (a === "clear-filters") {
    updateFilters({ q: "", scope: "all", category: "", window: "" });
    render();
  }
  if (a === "clear-selection") {
    write(() => {
      db.ui.selection[current.id] = [];
    });
    refreshRows();
  }
  if (a === "bulk-category" || a === "bulk-window") {
    const key = a === "bulk-category" ? "category" : "window",
      v = document.querySelector("#bulk-" + key).value;
    if (!v)
      return toast(
        `Choose a ${key === "window" ? "bidding window" : "category"} first.`,
      );
    const count = selected().length;
    if (
      write(
        () => {
          current.lots
            .filter((l) => selected().includes(l.id))
            .forEach((l) => (l[key] = v));
          touch(current);
          db.ui.selection[current.id] = [];
        },
        `${count} lots ${key === "window" ? "assigned to the draft window" : "categorized"} locally.`,
      )
    )
      render();
  }
  if (a === "category-lots") {
    updateFilters({
      category: b.dataset.value,
      scope: "all",
      window: "",
      q: "",
    });
    location.hash = href("lots");
  }
  if (a === "window-lots") {
    updateFilters({
      window: b.dataset.value,
      category: "",
      scope: "all",
      q: "",
    });
    location.hash = href("lots");
  }
  if (a === "issue-lots") {
    updateFilters({ scope: b.dataset.value, category: "", window: "", q: "" });
    location.hash = href("lots");
  }
  if (a === "resolve") {
    if (b.dataset.filter)
      updateFilters({
        scope: b.dataset.filter,
        category: "",
        window: "",
        q: "",
      });
    else if (b.dataset.page === "lots")
      updateFilters({ scope: "issues", q: "", window: "", category: "" });
    location.hash = href(b.dataset.page);
  }
  if (a === "duplicate") {
    const source = current.lots.find((l) => l.id === b.dataset.item);
    if (
      write(() => {
        current.lots.push({
          ...structuredClone(source),
          id: uid(),
          title: source.title + " (copy)",
        });
        touch(current);
      }, "Lot duplicated locally. It keeps its draft category and window.")
    ) {
      b.disabled = true;
      closeEditor();
    }
  }
  if (a === "review" && checks(current).every((c) => c.ok)) {
    write(() => {
      current.review = { revision: current.revision, at: Date.now() };
    }, "Readiness review recorded locally. Nothing published.");
    render();
  }
  if (a === "sms-test") {
    if (!current.sms.sender || !current.sms.consent)
      return toast("Review the demo sender and consent approach first.");
    const id = current.id,
      outcome = document.querySelector("#sms-outcome").value;
    if (!write(() => (current.sms.test = "pending"))) return;
    render();
    setTimeout(() => {
      const evt = eventById(id);
      if (evt.sms.test !== "pending") return;
      write(() => {
        evt.sms.test = outcome;
      });
      if (current.id === id && route().page === "notifications") render();
      toast(
        outcome === "passed"
          ? "Fixture readiness check passed. No text sent."
          : "Simulated provider failure. No text sent.",
      );
    }, 650);
  }
  if (a === "print-qr") {
    let sheet = document.querySelector(".print-sheet");
    if (!sheet) {
      sheet = document.createElement("section");
      sheet.className = "print-sheet";
      document.body.append(sheet);
    }
    sheet.innerHTML = `<h1>${esc(current.name)}</h1><p>Scan the shared event link</p>${qr()}<p>Shared link · not an individual admission credential</p><span class="link-code">${esc(sharedLink())}</span><p>Local prototype. No admission, bidding, or hosted sharing.</p>`;
    window.print();
  }
  if (a === "present-qr") openEditor("qr");
  if (a === "copy-link")
    navigator.clipboard
      .writeText(sharedLink())
      .then(() => toast("Demo event link copied."))
      .catch(() => toast("Copy unavailable. Select the demo link above."));
}
app.addEventListener("click", handleClick);
dialog.addEventListener("click", handleClick);
dialog.addEventListener("cancel", (e) => {
  e.preventDefault();
  closeEditor();
});
dialog.addEventListener("input", (e) => {
  const f = e.target.closest("#edit-form");
  if (!f) return;
  const d = Object.fromEntries(new FormData(f));
  write(() => {
    db.drafts[draftKey(route())] = d;
  });
  if (
    route().kind === "lot" &&
    ["opening", "increment"].includes(e.target.name)
  )
    document.querySelector("#increment-example").innerHTML =
      incrementExample(d);
  if (e.target.name === "heading")
    document.querySelector("#heading-preview").src = imageSrc(
      e.target.value || "dinner",
    );
});
dialog.addEventListener("submit", (e) => {
  e.preventDefault();
  saveEditor(e.target);
});
app.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "display-form") {
    if (
      write(() => {
        current.display.applied = structuredClone(current.display.draft);
      }, "Draft applied to the simulated display only.")
    )
      render();
  }
  if (f.id === "donation-form") {
    const d = Object.fromEntries(new FormData(f));
    d.enabled = f.elements.enabled.checked;
    if (
      write(() => {
        current.donation = d;
        touch(current);
      }, "Donation presentation saved locally. No money moved.")
    )
      render();
  }
});
for (const e of db.events)
  if (e.sms.test === "pending") e.sms.test = "interrupted";
try {
  persist();
} catch {
  storageOk = false;
  toast(
    "Local storage is unavailable. Changes cannot be saved until storage is restored.",
  );
}
window.addEventListener("hashchange", render);
if (!location.hash) location.replace(href("lots", db.ui.active));
else render();
