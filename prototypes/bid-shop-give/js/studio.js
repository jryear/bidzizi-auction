// Studio for the prototype. Two models for where shop items and purchases live:
//   A "One list"       — shop items sit in the Items list with a Type; purchases live in Results; Live counts both.
//   B "Shop workspace" — Shop is its own mode next to Set up / Live / Results: Products, Purchases, Pickup desk.
import { store, money, standing, sold, itemById, person, setStatus, updateItem, addItem, TRANSITIONS, live as notCancelled } from "./store.js";
import { h, I, photo, tile, left, clock, initials } from "./ui.js";

const LABEL = { committed: "To collect", paid: "Paid", picked_up: "Picked up", cancelled: "Cancelled" };
const NEXT = { committed: ["paid", "Mark paid"], paid: ["picked_up", "Mark picked up"] };

export function mountStudio(root, variant) {
  const ui = { mode: "setup", type: "all", q: "", pq: "", pstatus: "all", edit: null, confirm: null, add: { kind: "auction" }, shopTab: "products", desk: "", resTab: "purchases", toast: null };
  const st = () => store.get(), v = () => variant();

  function toast(t) { ui.toast = t; render(); clearTimeout(toast.t); toast.t = setTimeout(() => { ui.toast = null; render(); }, 3200); }

  function top() {
    const e = st().event;
    const modes = [["setup", "Set up", I.grid], ["live", "Live", I.clock], ...(v() === "b" ? [["shop", "Shop", I.bag]] : []), ["results", "Results", I.check]];
    const toCollect = st().purchases.filter(p => p.status === "committed").length;
    return `<header class="s-top"><button class="s-icon" aria-label="All events">${I.chevL(20)}</button>
      <div class="s-title"><b>${h(e.name)}</b><span><span class="vis"><i></i>Published</span> changes appear instantly · <span class="ok">${I.check(13)} Saved</span></span></div>
      <div class="s-modes" role="tablist">${modes.map(([id, label, icon]) => `<button role="tab" aria-selected="${ui.mode === id}" class="${ui.mode === id ? "on" : ""}" data-act="mode" data-v="${id}">${icon(16)}<span>${label}</span>${id === (v() === "b" ? "shop" : "results") && toCollect ? `<em>${toCollect}</em>` : ""}</button>`).join("")}</div>
      <div class="s-acts"><button class="s-btn ghost">Preview</button><button class="s-btn">Share <code>${h(e.code)}</code></button></div></header>`;
  }

  // ------------------------------------------------------------------ Items (A: typed list · B: auction list only)
  function itemsWorkspace() {
    const all = st().items;
    const list = all.filter(i => (v() === "b" ? i.kind === "auction" : ui.type === "all" || i.kind === ui.type) &&
      (!ui.q || `${i.title} ${i.donor}`.toLowerCase().includes(ui.q.toLowerCase())));
    const nA = all.filter(i => i.kind === "auction").length, nS = all.filter(i => i.kind === "shop").length;
    const typeChips = v() === "a" ? `<div class="s-chips">${[["all", "All", nA + nS], ["auction", "Auction", nA], ["shop", "Shop", nS]].map(([id, l, n]) => `<button class="s-chip${ui.type === id ? " on" : ""}" data-act="type" data-v="${id}">${l}<i>${n}</i></button>`).join("")}</div>` : "";
    const head = `<div class="s-ws-head"><div><h1>${v() === "b" ? "Auction items" : "Items"} <small>${list.length}</small></h1><p class="s-green">${list.filter(i => i.ready).length} visible to guests</p></div>
      <div class="s-ws-acts"><button class="s-btn">Add photos</button><button class="s-btn">Paste rows</button></div></div>`;
    const tools = `<div class="s-tools"><label class="s-search">${I.search(17)}<input type="search" data-act="q" value="${h(ui.q)}" placeholder="Search titles, providers" aria-label="Search items"></label>${typeChips}</div>`;
    const rows = list.map(i => {
      const isShop = i.kind === "shop", s = isShop ? null : standing(i), n = sold(i.id);
      const price = isShop ? `<b>${money(i.priceMinor)}</b><small>each</small>` : `<b>${money(i.openingMinor)}</b><small>start</small>`;
      const status = isShop ? `<div class="s-stock"><span>${n} of ${i.quantity} sold</span><span class="bar"><i style="width:${Math.round(100 * n / i.quantity)}%"></i></span>${i.remaining ? "" : `<em>Sold out</em>`}</div>`
        : s.count ? `<div class="s-top-bid"><b>${money(s.top.amountMinor)}</b><small>${s.count} bid${s.count > 1 ? "s" : ""}</small></div>` : `<small class="muted">No bids yet</small>`;
      return `<tr class="${ui.edit === i.id ? "on" : ""}" data-act="edit" data-v="${i.id}"><td class="num">${String(i.number).padStart(2, "0")}</td><td class="ph">${photo(i, "thumb")}</td>
        <td class="t"><b>${h(i.title)}</b>${i.ready ? "" : `<small class="hidden-tag">Hidden</small>`}</td>
        ${v() === "a" ? `<td><span class="kind k-${i.kind}">${isShop ? I.bag(14) : I.gavel(14)}${isShop ? "Shop" : "Auction"}</span></td>` : ""}
        <td>${h(i.category)}</td><td>${h(i.donor)}</td><td class="money">${price}</td><td class="st">${status}</td><td class="go">${I.chevR(16)}</td></tr>`;
    }).join("");
    const k = v() === "b" ? "auction" : ui.add.kind;
    const add = `<div class="s-add"><div class="s-add-row">${v() === "a" ? `<div class="s-kind" role="group" aria-label="New item type">${["auction", "shop"].map(x => `<button class="${k === x ? "on" : ""}" data-act="add-kind" data-v="${x}">${x === "shop" ? "Shop" : "Auction"}</button>`).join("")}</div>` : ""}
      <input data-f="title" placeholder="Add an item: type a title" aria-label="Title"><input data-f="category" placeholder="Category" aria-label="Category"><input data-f="donor" placeholder="Provided by" aria-label="Provided by">
      <label class="s-money"><span>$</span><input data-f="price" inputmode="decimal" placeholder="${k === "shop" ? "Price" : "Starting bid"}" aria-label="${k === "shop" ? "Price" : "Starting bid"}"></label>
      ${k === "shop" ? `<input data-f="quantity" class="sm" inputmode="numeric" placeholder="Qty" aria-label="Quantity"><input data-f="limit" class="sm" inputmode="numeric" placeholder="Limit" aria-label="Per-guest limit (optional)">` : ""}
      <button class="s-btn primary" data-act="add">Add</button></div><p class="s-hint">${k === "shop" ? "Shop items sell at a fixed price until stock runs out. Limit is per guest and optional." : "Enter adds it. New items start hidden; show each one when it&rsquo;s ready."}</p></div>`;
    const cols = `<tr><th>#</th><th>Photo</th><th>Title</th>${v() === "a" ? "<th>Type</th>" : ""}<th>Category</th><th>Provided by</th><th>${v() === "a" ? "Price / start" : "Starting"}</th><th>${v() === "a" ? "Bids / sold" : "Top bid"}</th><th></th></tr>`;
    return `${head}${tools}<div class="s-table-wrap"><table class="s-table"><thead>${cols}</thead><tbody>${rows}</tbody></table>${add}</div>`;
  }

  function editor() {
    const i = ui.edit && itemById(ui.edit); if (!i) return "";
    const isShop = i.kind === "shop", n = isShop ? sold(i.id) : 0, bids = isShop ? 0 : standing(i).count;
    const locked = isShop ? n > 0 : bids > 0;
    return `<aside class="s-drawer" aria-label="Edit item"><div class="s-drawer-head"><b>Item ${String(i.number).padStart(2, "0")}</b><button class="s-icon" data-act="close-edit" aria-label="Close">${I.x(18)}</button></div>
      <div class="s-drawer-media">${photo(i, "dr")}</div>
      <label class="s-field"><span>Title</span><input data-e="title" value="${h(i.title)}"></label>
      <div class="s-field"><span>Type</span><div class="s-kind wide" role="group">${["auction", "shop"].map(x => `<button class="${i.kind === x ? "on" : ""}" ${locked ? "disabled" : ""} data-act="kind" data-v="${x}">${x === "shop" ? "Shop · fixed price" : "Auction · bidding"}</button>`).join("")}</div>${locked ? `<small>Type is fixed once an item has ${isShop ? "purchases" : "bids"}.</small>` : ""}</div>
      ${isShop ? `<div class="s-grid2"><label class="s-field"><span>Price</span><span class="s-money"><span>$</span><input data-e="priceMinor" inputmode="decimal" value="${i.priceMinor / 100}" ${n ? "disabled" : ""}></span>${n ? "<small>Locked after the first sale.</small>" : ""}</label>
          <label class="s-field"><span>Quantity</span><input data-e="quantity" inputmode="numeric" value="${i.quantity}"><small>${n} sold · ${i.remaining} left. Can&rsquo;t go below ${n}.</small></label></div>
        <label class="s-field"><span>Limit per guest <i>optional</i></span><input data-e="limit" inputmode="numeric" value="${i.limit ?? ""}" placeholder="No limit"></label>
        <label class="s-field"><span>Pick up</span><input data-e="pickup" value="${h(i.pickup)}" placeholder="Where and when guests collect it"><small>Shown on the guest&rsquo;s purchase.</small></label>`
      : `<label class="s-field"><span>Starting bid</span><span class="s-money"><span>$</span><input data-e="openingMinor" inputmode="decimal" value="${i.openingMinor / 100}" ${bids ? "disabled" : ""}></span>${bids ? "<small>Locked after the first bid.</small>" : ""}</label>`}
      <div class="s-grid2"><label class="s-field"><span>Category</span><input data-e="category" value="${h(i.category)}"></label><label class="s-field"><span>Provided by</span><input data-e="donor" value="${h(i.donor)}"></label></div>
      <label class="s-field"><span>Short line</span><input data-e="short" value="${h(i.short)}"></label>
      <label class="s-check"><input type="checkbox" data-e="ready" ${i.ready ? "checked" : ""}> Visible to guests</label></aside>`;
  }

  // ------------------------------------------------------------------ Purchases (A: in Results · B: in Shop)
  function purchases() {
    const all = st().purchases.slice().sort((a, b) => b.at - a.at);
    const counts = Object.fromEntries(["committed", "paid", "picked_up", "cancelled"].map(k => [k, all.filter(p => p.status === k).length]));
    const list = all.filter(p => (ui.pstatus === "all" || p.status === ui.pstatus) && (!ui.pq || `${person(p.who).name} ${person(p.who).business} ${itemById(p.itemId).title}`.toLowerCase().includes(ui.pq.toLowerCase())));
    const committedMinor = all.filter(notCancelled).reduce((s, p) => s + p.quantity * p.unitMinor, 0);
    const collected = all.filter(p => p.status === "paid" || p.status === "picked_up").reduce((s, p) => s + p.quantity * p.unitMinor, 0);
    const rows = list.map(p => {
      const i = itemById(p.itemId), who = person(p.who), nx = NEXT[p.status];
      const confirming = ui.confirm === p.id;
      return `<tr class="p-${p.status}"><td class="time">${clock(p.at)}</td><td><b>${h(who.name)}</b><small>${h(who.business)}</small></td><td class="item"><div>${tile(i, "xs")}<span>${h(i.title)}</span></div></td>
        <td class="qty">${p.quantity}</td><td class="money"><b>${money(p.quantity * p.unitMinor)}</b></td><td><span class="ps s-${p.status}">${LABEL[p.status]}</span></td>
        <td class="acts"><div class="acts-in">${confirming ? `<div class="s-confirm"><span>Cancel ${p.quantity} × ${h(i.title)}? ${p.quantity} go${p.quantity === 1 ? "es" : ""} back into stock.</span><button class="s-btn sm" data-act="keep">Keep</button><button class="s-btn sm danger" data-act="cancel-yes" data-v="${p.id}">Cancel purchase</button></div>`
          : `${nx ? `<button class="s-btn sm" data-act="status" data-v="${p.id}" data-to="${nx[0]}">${nx[1]}</button>` : ""}${TRANSITIONS[p.status].includes("cancelled") ? `<button class="s-icon sm" data-act="cancel" data-v="${p.id}" aria-label="Cancel purchase" title="Cancel purchase">${I.x(16)}</button>` : ""}`}</div></td></tr>`;
    }).join("");
    return `<div class="s-kpis small"><div><span>Committed</span><b>${money(committedMinor)}</b></div><div><span>Collected</span><b>${money(collected)}</b></div><div><span>To collect</span><b>${counts.committed}</b></div><div><span>Picked up</span><b>${counts.picked_up}</b></div></div>
      <div class="s-tools"><label class="s-search">${I.search(17)}<input type="search" data-act="pq" value="${h(ui.pq)}" placeholder="Search buyer or item" aria-label="Search purchases"></label>
      <div class="s-chips">${[["all", "All", all.length], ["committed", "To collect", counts.committed], ["paid", "Paid", counts.paid], ["picked_up", "Picked up", counts.picked_up], ["cancelled", "Cancelled", counts.cancelled]].map(([id, l, n]) => `<button class="s-chip${ui.pstatus === id ? " on" : ""}" data-act="pstatus" data-v="${id}">${l}<i>${n}</i></button>`).join("")}</div>
      <button class="s-btn" data-act="csv">Export CSV</button></div>
      <div class="s-table-wrap"><table class="s-table purchases"><thead><tr><th>Time</th><th>Buyer</th><th>Item</th><th>Qty</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="7" class="empty">No purchases match.</td></tr>`}</tbody></table></div>`;
  }

  // B only: the gift-table view. Find a guest, see what they bought, settle it in one place.
  function desk() {
    const q = ui.desk.toLowerCase();
    const buyers = st().people.filter(p => st().purchases.some(x => x.who === p.id && x.status !== "cancelled" && x.status !== "picked_up"));
    const shown = buyers.filter(p => !q || `${p.name} ${p.business}`.toLowerCase().includes(q));
    return `<div class="desk"><label class="s-search big">${I.search(20)}<input type="search" data-act="desk" value="${h(ui.desk)}" placeholder="Guest or business name" aria-label="Find a guest"></label>
      <div class="desk-list">${shown.map(p => {
        const open = st().purchases.filter(x => x.who === p.id && (x.status === "committed" || x.status === "paid"));
        const due = open.filter(x => x.status === "committed").reduce((s, x) => s + x.quantity * x.unitMinor, 0);
        return `<section class="desk-card"><header><span class="s-av">${initials(p.business)}</span><div><b>${h(p.name)}</b><small>${h(p.business)}</small></div><div class="due">${due ? `<span>Due</span><b>${money(due)}</b>` : `<span class="paid">Paid</span>`}</div></header>
          <ul>${open.map(x => { const i = itemById(x.itemId); return `<li>${tile(i, "xs")}<span>${x.quantity} × ${h(i.title)}<small>${h(i.pickup)}</small></span><b>${money(x.quantity * x.unitMinor)}</b><span class="ps s-${x.status}">${LABEL[x.status]}</span></li>`; }).join("")}</ul>
          <footer>${due ? `<button class="s-btn" data-act="desk-pay" data-v="${p.id}">Mark all paid · ${money(due)}</button>` : ""}<button class="s-btn primary" data-act="desk-hand" data-v="${p.id}">Paid and handed over</button></footer></section>`;
      }).join("") || `<p class="empty">Nobody is waiting to collect${q ? " under that name" : ""}.</p>`}</div></div>`;
  }

  function products() {
    const list = st().items.filter(i => i.kind === "shop");
    return `<div class="s-ws-head"><div><h1>Shop <small>${list.length}</small></h1><p class="s-green">${list.filter(i => i.ready && i.remaining).length} on sale · ${list.filter(i => !i.remaining).length} sold out</p></div><div class="s-ws-acts"><button class="s-btn">Paste rows</button><button class="s-btn primary" data-act="new-shop">Add product</button></div></div>
      <div class="prod-grid">${list.map(i => { const n = sold(i.id); return `<article class="prod${ui.edit === i.id ? " on" : ""}" data-act="edit" data-v="${i.id}">${tile(i, "prod-tile")}
        <div class="prod-body"><b>${h(i.title)}</b><small>${h(i.donor)}</small><div class="prod-line"><span class="money"><b>${money(i.priceMinor)}</b></span>${i.limit != null ? `<span class="lim">Limit ${i.limit}</span>` : ""}</div>
        <div class="s-stock"><span>${n} of ${i.quantity} sold</span><span class="bar"><i style="width:${Math.round(100 * n / i.quantity)}%"></i></span></div>
        <div class="prod-stock"><span>${i.remaining ? `${i.remaining} left` : "<em>Sold out</em>"}</span><span class="step"><button data-act="stock" data-v="${i.id}" data-d="-1" aria-label="One fewer" ${i.quantity <= n || i.quantity <= 1 ? "disabled" : ""}>${I.minus(14)}</button><button data-act="stock" data-v="${i.id}" data-d="1" aria-label="One more">${I.plus(14)}</button></span></div></div></article>`; }).join("")}</div>`;
  }

  // ------------------------------------------------------------------ Live
  function livePage() {
    const bidsMinor = st().items.filter(i => i.kind === "auction").reduce((s, i) => s + (standing(i).top?.amountMinor ?? 0), 0);
    const shopMinor = st().purchases.filter(notCancelled).reduce((s, p) => s + p.quantity * p.unitMinor, 0);
    const units = st().purchases.filter(notCancelled).reduce((s, p) => s + p.quantity, 0);
    const out = st().items.filter(i => i.kind === "shop" && !i.remaining), low = st().items.filter(i => i.kind === "shop" && i.remaining > 0 && i.remaining <= 3);
    const feed = [...st().bids.map(b => ({ at: b.at, who: b.who, text: `bid on ${itemById(b.itemId).title}`, amt: b.amountMinor, k: "bid" })),
      ...st().purchases.map(p => ({ at: p.at, who: p.who, text: `bought ${p.quantity} × ${itemById(p.itemId).title}`, amt: p.quantity * p.unitMinor, k: "buy" }))].sort((a, b) => b.at - a.at).slice(0, 9);
    return `<div class="s-kpis"><div class="dark"><span>Ends in</span><b>${left(st().event.endsAt - Date.now())}</b></div><div><span>Top bids</span><b>${money(bidsMinor)}</b></div><div><span>Shop sales</span><b>${money(shopMinor)}</b><small>${units} units</small></div><div><span>Joined</span><b>${st().people.length}</b></div></div>
      ${out.length || low.length ? `<div class="s-alert">${I.bag(18)}<div>${out.length ? `<b>Sold out:</b> ${out.map(i => h(i.title)).join(" · ")}` : ""}${out.length && low.length ? "<br>" : ""}${low.length ? `<b>Almost gone:</b> ${low.map(i => `${h(i.title)} (${i.remaining})`).join(" · ")}` : ""}</div></div>` : ""}
      <section class="s-feed"><h2>Latest activity</h2><ul>${feed.map(f => `<li><span class="time">${clock(f.at)}</span><span class="tag t-${f.k}">${f.k === "buy" ? "Shop" : "Bid"}</span><span><b>${h(person(f.who).business)}</b> ${h(f.text)}</span><b class="money">${money(f.amt)}</b></li>`).join("")}</ul></section>`;
  }

  function results() {
    if (v() === "b") return `<div class="s-ws-head"><div><h1>Results</h1><p>Winners and donations. Shop purchases are settled in <button class="link" data-act="mode" data-v="shop">Shop</button>.</p></div></div>${winners()}`;
    const tabs = [["winners", "Winners"], ["purchases", "Purchases"], ["donations", "Donations"]];
    const toCollect = st().purchases.filter(p => p.status === "committed").length;
    return `<div class="s-ws-head"><div><h1>Results</h1><p>Confirm winners, settle purchases, process donations.</p></div></div>
      <div class="s-subtabs">${tabs.map(([id, l]) => `<button class="${ui.resTab === id ? "on" : ""}" data-act="restab" data-v="${id}">${l}${id === "purchases" && toCollect ? `<em>${toCollect}</em>` : ""}</button>`).join("")}</div>
      ${ui.resTab === "purchases" ? purchases() : ui.resTab === "winners" ? winners() : `<p class="empty">Donations are unchanged from today&rsquo;s Studio.</p>`}`;
  }
  function winners() {
    return `<div class="s-table-wrap"><table class="s-table"><thead><tr><th>Item</th><th>Proposed winner</th><th>Amount</th><th></th></tr></thead><tbody>${st().items.filter(i => i.kind === "auction").map(i => { const s = standing(i); return `<tr><td class="item"><div>${photo(i, "thumb")}<span>${h(i.title)}</span></div></td><td>${s.top ? `<b>${h(person(s.top.who).business)}</b><small>${h(person(s.top.who).name)}</small>` : `<small class="muted">No bids</small>`}</td><td class="money"><b>${s.top ? money(s.top.amountMinor) : "—"}</b></td><td class="acts"><small class="muted">Confirm after close</small></td></tr>`; }).join("")}</tbody></table></div>`;
  }

  function shopMode() {
    const tabs = [["products", "Products"], ["purchases", "Purchases"], ["desk", "Pickup desk"]];
    const toCollect = st().purchases.filter(p => p.status === "committed").length;
    return `<div class="s-subtabs top">${tabs.map(([id, l]) => `<button class="${ui.shopTab === id ? "on" : ""}" data-act="shoptab" data-v="${id}">${l}${id === "purchases" && toCollect ? `<em>${toCollect}</em>` : ""}</button>`).join("")}</div>
      ${ui.shopTab === "products" ? products() : ui.shopTab === "purchases" ? `<div class="s-ws-head"><div><h1>Purchases</h1><p>Payment is collected at pickup.</p></div></div>${purchases()}` : `<div class="s-ws-head"><div><h1>Pickup desk</h1><p>For the gift table: find the guest, take payment, hand it over.</p></div></div>${desk()}`}`;
  }

  function setupNav() {
    const nA = st().items.filter(i => i.kind === "auction").length, nS = st().items.filter(i => i.kind === "shop").length;
    const row = (id, label, sub, on) => `<button class="s-nav-row${on ? " on" : ""}" data-act="${id}">${label}<small>${sub}</small></button>`;
    return `<nav class="s-nav"><span class="s-nav-h">Event</span>${row("noop", "Welcome &amp; details", "Holiday Trade Show")}${row("noop", "Schedule", "11:51 AM – 3:01 PM")}${row("noop", "Look", "Classic")}${row("noop", "Bidding rules", "Name and business")}${row("noop", "Donations", "2 nonprofits")}
      <span class="s-nav-h">${v() === "b" ? "Selling" : "Items"}</span>${v() === "b" ? `${row("goitems", "Auction items", `${nA} items`, ui.mode === "setup")}${row("goshop", "Shop", `${nS} products`, ui.mode === "shop")}` : row("noop", "All items", `${nA} auction · ${nS} shop`, true)}</nav>`;
  }

  // ------------------------------------------------------------------ render
  function render() {
    root.className = `s s-${v()}`;
    let main;
    if (ui.mode === "setup") main = `<div class="s-setup">${setupNav()}<div class="s-ws">${itemsWorkspace()}</div>${editor()}</div>`;
    else if (ui.mode === "shop") main = `<div class="s-setup">${setupNav()}<div class="s-ws">${shopMode()}</div>${ui.shopTab === "products" ? editor() : ""}</div>`;
    else if (ui.mode === "live") main = `<div class="s-page">${livePage()}</div>`;
    else main = `<div class="s-page">${results()}</div>`;
    const keep = document.activeElement?.closest?.(".s") ? document.activeElement.dataset.act ?? document.activeElement.dataset.e : null;
    const ys = [...root.querySelectorAll(".s-main, .s-ws, .s-drawer")].map(x => [x.className.split(" ")[0], x.scrollTop]);
    root.innerHTML = `${top()}<main class="s-main">${main}</main>${ui.toast ? `<div class="s-toast" role="status">${ui.toast}</div>` : ""}`;
    for (const [c, y] of ys) { const x = root.querySelector("." + c); if (x) x.scrollTop = y; }
    if (keep && ["q", "pq", "desk"].includes(keep)) { const el = root.querySelector(`[data-act="${keep}"]`); el?.focus(); el?.setSelectionRange?.(el.value.length, el.value.length); }
  }

  root.addEventListener("click", e => {
    const el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
    const act = el.dataset.act, val = el.dataset.v;
    if (["q", "pq", "desk"].includes(act)) return;
    switch (act) {
      case "mode": ui.mode = val; ui.edit = null; ui.confirm = null; render(); break;
      case "goitems": ui.mode = "setup"; ui.edit = null; render(); break;
      case "goshop": ui.mode = "shop"; ui.shopTab = "products"; ui.edit = null; render(); break;
      case "type": ui.type = val; render(); break;
      case "edit": if (e.target.closest("button[data-act='stock']")) return; ui.edit = ui.edit === val ? null : val; render(); break;
      case "close-edit": ui.edit = null; render(); break;
      case "kind": {
        const i = itemById(ui.edit);
        if (val === i.kind) break;
        updateItem(i.id, val === "shop" ? { kind: "shop", priceMinor: i.openingMinor, quantity: 1, remaining: 1, limit: null, pickup: "", art: "gift", tint: "#6B5B95" } : { kind: "auction", openingMinor: i.priceMinor, increment: 2500 });
        break;
      }
      case "add-kind": ui.add.kind = val; render(); break;
      case "add": {
        const f = Object.fromEntries([...root.querySelectorAll(".s-add [data-f]")].map(x => [x.dataset.f, x.value.trim()]));
        if (!f.title) { root.querySelector('[data-f="title"]').focus(); break; }
        const cents = Math.round(parseFloat(f.price || "0") * 100) || 2500;
        const kind = v() === "b" ? "auction" : ui.add.kind;
        const it = addItem(kind === "shop" ? { kind, title: f.title, category: f.category, donor: f.donor, priceMinor: cents, quantity: Number(f.quantity) || 10, limit: f.limit ? Number(f.limit) : null }
          : { kind, title: f.title, category: f.category, donor: f.donor, openingMinor: cents, photo: "cabin" });
        ui.edit = it.id; toast(`Added ${h(it.title)}. It&rsquo;s hidden until you show it.`); break;
      }
      case "new-shop": { const it = addItem({ kind: "shop", title: "New product", priceMinor: 2000, quantity: 10, limit: null }); ui.edit = it.id; render(); break; }
      case "stock": { const i = itemById(val); updateItem(val, { quantity: Math.max(sold(i.id), 1, i.quantity + Number(el.dataset.d)) }); break; }
      case "pstatus": ui.pstatus = val; render(); break;
      case "status": setStatus(val, el.dataset.to); toast(el.dataset.to === "paid" ? "Marked paid" : "Marked picked up"); break;
      case "cancel": ui.confirm = val; render(); break;
      case "keep": ui.confirm = null; render(); break;
      case "cancel-yes": { const p = st().purchases.find(x => x.id === val); setStatus(val, "cancelled"); ui.confirm = null; toast(`Cancelled. ${p.quantity} back in stock.`); break; }
      case "restab": ui.resTab = val; render(); break;
      case "shoptab": ui.shopTab = val; ui.edit = null; render(); break;
      case "desk-pay": for (const p of st().purchases.filter(x => x.who === val && x.status === "committed")) setStatus(p.id, "paid"); toast("Marked paid"); break;
      case "desk-hand": for (const p of st().purchases.filter(x => x.who === val && (x.status === "committed" || x.status === "paid"))) { if (p.status === "committed") setStatus(p.id, "paid"); setStatus(p.id, "picked_up"); } toast("Paid and handed over"); break;
      case "csv": {
        const rows = [["time", "buyer", "business", "item", "quantity", "amount", "status"], ...st().purchases.map(p => [new Date(p.at).toISOString(), person(p.who).name, person(p.who).business, itemById(p.itemId).title, p.quantity, (p.quantity * p.unitMinor / 100).toFixed(2), p.status])];
        const blob = new Blob([rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "purchases-SYNTHETIC.csv"; a.click(); break;
      }
    }
  });
  root.addEventListener("input", e => {
    const act = e.target.dataset.act;
    if (act === "q") { ui.q = e.target.value; render(); }
    if (act === "pq") { ui.pq = e.target.value; render(); }
    if (act === "desk") { ui.desk = e.target.value; render(); }
  });
  root.addEventListener("change", e => {
    const f = e.target.dataset.e; if (!f || !ui.edit) return;
    const i = itemById(ui.edit);
    let val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    if (f === "priceMinor" || f === "openingMinor") val = Math.max(100, Math.round(parseFloat(val || "0") * 100));
    if (f === "quantity") val = Math.max(sold(i.id), 1, parseInt(val || "0", 10));
    if (f === "limit") val = val ? Math.max(1, parseInt(val, 10)) : null;
    updateItem(i.id, { [f]: val });
    toast("Saved");
  });
  root.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.closest(".s-add")) root.querySelector('[data-act="add"]').click(); });

  return { render };
}
