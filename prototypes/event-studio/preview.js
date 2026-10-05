// Reuse Design A's renderers without committing any A bidder state or enabling bidding.
import { event, lots, categories, sponsors } from "../lanyard/src/data.js";
import { state } from "../lanyard/src/store.js";
import { lotsView, lotView } from "../lanyard/src/views.js";
import { eventById, dateLabel } from "./model.js";
const id = new URLSearchParams(location.search).get("event");
const source = eventById(id),
  view = document.querySelector("#view");
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
if (!source) {
  view.innerHTML =
    '<div class="empty-preview"><h1>Draft unavailable</h1><p>This local event exists only in the browser where it was created. Hosted sharing is not implemented.</p></div>';
} else {
  Object.assign(event, {
    name: source.name,
    host: "Northline Business Exchange",
    date: dateLabel(source.date),
    closes: "Draft window",
    timezone: source.timezone,
    increment: 2500,
    lotCount: source.lots.length,
  });
  lots.splice(
    0,
    lots.length,
    ...source.lots.map((l, i) => ({
      ...l,
      number: String(i + 1).padStart(2, "0"),
      image: l.image ? `../lanyard/assets/lots/${l.image}.jpg` : null,
      alt: l.title,
      short: l.description.slice(0, 90),
      sponsor: l.source || "Northline Business Exchange",
      logo: l.logo || "earth",
      category: l.category || "Uncategorized",
      count: 0,
      history: [],
      includes: ["Fictional item for staff review"],
      fine: "Draft content only. Terms, admission, and real auction rules remain undecided.",
    })),
  );
  categories.splice(
    0,
    categories.length,
    "All",
    ...new Set(lots.map((l) => l.category)),
  );
  sponsors.splice(0, sponsors.length);
  Object.assign(state, {
    identity: null,
    online: true,
    outbox: [],
    watch: {},
    maxes: {},
    mflow: {},
    snap: {
      lots: Object.fromEntries(lots.map((l) => [l.id, { bids: [], added: 0 }])),
      closed: false,
      asOf: "Draft",
    },
    ui: {
      view: "cards",
      cat: "All",
      sort: "number",
      q: "",
      text: "standard",
      motion: "system",
    },
    sim: { assumptions: false },
  });
  function render() {
    const path = location.hash.replace(/^#\/?/, "").split("/");
    if (path[0] === "welcome") {
      view.innerHTML = `${source.heading ? `<img class="welcome-image" src="../lanyard/assets/lots/${source.heading}.jpg" alt="Event heading">` : ""}<main class="welcome-body"><span class="lbl">Northline Business Exchange presents</span><h1>${esc(source.name)}</h1><p>${esc(source.welcome || "Welcome message not yet written.")}</p><div class="entry-facts"><span class="lbl">Physical event</span><p>${esc(dateLabel(source.date))}<br>${esc(source.location || "Venue not set")}<br>${esc(source.timezone)}</p></div><a class="btn primary block" href="#lots">Browse draft lots</a><p class="fine">The draft catalog is visible to staff here. Actual catalog visibility starts when bidding opens in existing staging; later windows remain undecided.</p>${source.sponsors.length ? `<section><span class="lbl">With thanks to our sponsors</span><div class="sponsors">${source.sponsors.map((s) => `<span>${esc(s)}</span>`).join("")}</div></section>` : ""}${source.donation.enabled ? `<section style="margin-top:22px"><span class="lbl">Giving information · simulation</span><p>${esc(source.donation.description || "Not yet written.")}</p><p>No payment or donation is taken.</p></section>` : ""}</main>`;
    } else if (path[0] === "lot" && lots.find((l) => l.id === path[1])) {
      const l = lots.find((l) => l.id === path[1]),
        w = source.windows.find((w) => w.id === l.window);
      event.increment = l.increment;
      event.closes = w
        ? new Date(w.end).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })
        : "Unassigned";
      view.innerHTML = lotView(l.id).html;
      view
        .querySelectorAll(".watch,.maxcard,.actionbar,.tl,.assume,.assume-note")
        .forEach((n) => n.remove());
      const chip = view.querySelector(".chip-pass");
      if (chip)
        chip.outerHTML = '<span class="chip-pass guest">Draft preview</span>';
      view.insertAdjacentHTML(
        "beforeend",
        `<div class="preview-window"><b>${esc(w?.name || "No bidding window assigned")}</b>${w ? esc(dateLabel(w.start)) + " → " + esc(dateLabel(w.end)) : "Assign this lot in Event Studio."}<br>${esc(source.timezone)} · draft</div><p class="preview-disabled">Bid actions are unavailable in this staff preview. No bid can be placed.</p>`,
      );
    } else {
      view.innerHTML = lotsView().html;
      view
        .querySelectorAll(".watch,.assume,.assume-note")
        .forEach((n) => n.remove());
      const pass = view.querySelector(".pass");
      if (pass)
        pass.outerHTML = `<header class="pass"><div class="pass-text"><b>${esc(source.name)}</b><small>Staff draft preview · no bids</small></div><a class="pass-meta" href="#welcome">Event</a></header>`;
      if (!lots.length)
        view.querySelector("#lotlist").innerHTML =
          '<div class="empty-preview"><h2>No lots yet</h2><p>Add a lot in Event Studio to preview it here.</p></div>';
    }
  }
  const navigate = (hash) => {
    if (window.parent !== window) {
      history.replaceState(null, "", hash);
      render();
      scrollTo(0, 0);
    } else location.hash = hash;
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (b?.dataset.action === "cat") {
      state.ui.cat = b.dataset.v;
      render();
    }
    if (b?.dataset.action === "view") {
      state.ui.view = b.dataset.v;
      render();
    }
    if (b?.dataset.action === "clear-filters") {
      state.ui.q = "";
      state.ui.cat = "All";
      render();
    }
    if (b?.classList.contains("back")) {
      e.preventDefault();
      navigate("#lots");
    }
    const a = e.target.closest('a[href^="#"]');
    if (a) {
      e.preventDefault();
      let hash = a.getAttribute("href").replace("#/", "#");
      if (hash === "#event") hash = "#welcome";
      navigate(hash);
    }
  });
  view.addEventListener("input", (e) => {
    if (e.target.matches("[data-search]")) {
      state.ui.q = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const next = view.querySelector("[data-search]");
      next.focus();
      next.setSelectionRange(pos, pos);
    }
  });
  view.addEventListener("change", (e) => {
    if (e.target.dataset.action === "sort") {
      state.ui.sort = e.target.value;
      render();
    }
  });
  window.addEventListener("hashchange", () => {
    render();
    scrollTo(0, 0);
  });
  render();
}
