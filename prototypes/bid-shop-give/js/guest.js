// Guest phone app for the prototype. Two shells over the same journeys:
//   A "Inherit"   — today's Claude shell (ink pass header, photo cards, ink pill nav) with Browse · Mine · Event.
//   B "Transform" — a lighter shell: mode cards for Bid/Shop/Give, dense bid rows, a shop grid, pickups grouped by place.
import { store, ME, money, standing, held, canBuyUpTo, myPurchases, myPledges, itemById, person, buy, receiptOf, bid, pledge, watch } from "./store.js";
import { h, I, photo, tile, left, clock, rid, initials } from "./ui.js";

const FILTERS = [["bid", "Bid"], ["shop", "Shop"], ["give", "Give"]];
const TABS = [["browse", "Browse", I.grid], ["mine", "Mine", I.ticket], ["event", "Event", I.info]];
const STATUS = { committed: "Pay at pickup", paid: "Paid · ready to collect", picked_up: "Picked up", cancelled: "Cancelled by staff" };

export function mountGuest(root, variant) {
  const ui = { tab: "browse", filter: "bid", cat: "All", q: "", item: null, sheet: null, give: { recipient: null, amount: 5000, custom: "", step: "pick" }, toast: null, scroll: {} };
  readHash();

  function readHash() {
    const q = new URLSearchParams(location.hash.slice(1));
    if (q.get("t")) ui.tab = q.get("t");
    if (q.get("f")) ui.filter = q.get("f");
    ui.item = q.get("i");
  }
  function writeHash(push) {
    const q = new URLSearchParams(location.hash.slice(1));
    q.set("t", ui.tab); q.set("f", ui.filter); ui.item ? q.set("i", ui.item) : q.delete("i");
    const url = "#" + q.toString();
    push ? history.pushState(null, "", url) : history.replaceState(null, "", url);
  }
  addEventListener("popstate", () => { readHash(); ui.sheet = null; render(); });

  function go(patch, push = true) {
    const key = ui.item ? `i:${ui.item}` : `${ui.tab}:${ui.filter}`;
    const scroller = root.querySelector(".g-main");
    if (scroller) ui.scroll[key] = scroller.scrollTop;
    Object.assign(ui, patch);
    writeHash(push);
    render();
    const next = ui.item ? null : ui.scroll[`${ui.tab}:${ui.filter}`];
    const s = root.querySelector(".g-main"); if (s) s.scrollTop = next ?? 0;
  }
  function toast(t) { ui.toast = t; render(); clearTimeout(toast.timer); toast.timer = setTimeout(() => { ui.toast = null; render(); }, 3800); }

  // ------------------------------------------------------------------ pieces
  const st = () => store.get();
  const v = () => variant();
  const timeLeft = () => left(st().event.endsAt - Date.now());
  const endsLine = () => st().windowOpen
    ? `<span class="live-dot" aria-hidden="true"></span>Ends ${clock(st().event.endsAt)} · <b>${timeLeft()}</b> left`
    : `<span class="live-dot off" aria-hidden="true"></span>Closed. Thanks for joining`;

  function header() {
    const me = person(ME), e = st().event;
    if (ui.item) {
      const back = { browse: FILTERS.find(f => f[0] === ui.filter)[1], mine: "Mine", event: "Event" }[ui.tab];
      return `<header class="g-top"><button class="g-back" data-act="back">${I.chevL(22)}<span>${h(back)}</span></button><span class="g-top-name">${h(e.name)}</span><span class="g-me-mini" title="${h(me.business)}">${initials(me.business)}</span></header>`;
    }
    if (v() === "a") return `<header class="g-pass">
      <div class="g-badge"><span class="g-mark">${initials(me.business)}</span><span><b>${h(me.business)}</b><small>${h(me.name)}</small></span></div>
      <div class="g-ev"><span>${h(e.name)}</span><em>${h(e.code)}</em></div></header>`;
    return `<header class="g-head-b">
      <div><span class="g-ev-b">${h(e.name)}</span><span class="g-ends-b">${endsLine()}</span></div>
      <span class="g-me-b" title="${h(me.name)} · ${h(me.business)}">${initials(me.business)}</span></header>`;
  }

  function nav() {
    const outbid = st().items.filter(i => i.kind === "auction" && standing(i).mine.length && !standing(i).leaderIsMe).length;
    const toCollect = myPurchases().filter(p => p.status === "committed" || p.status === "paid").length;
    return `<nav class="g-nav" aria-label="Sections"><div class="g-nav-in">${TABS.map(([id, label, icon]) => {
      const on = ui.tab === id && !ui.item;
      const badge = id === "mine" && (outbid || toCollect) ? `<em class="g-dot${outbid ? "" : " calm"}" aria-label="${outbid ? `${outbid} outbid` : `${toCollect} to collect`}">${outbid || toCollect}</em>` : "";
      return `<button class="g-tab${on ? " on" : ""}" data-act="tab" data-v="${id}" ${on ? 'aria-current="page"' : ""}>${icon(21)}<span>${label}</span>${badge}</button>`;
    }).join("")}</div></nav>`;
  }

  function seg() {
    const items = st().items.filter(i => i.ready);
    const counts = { bid: items.filter(i => i.kind === "auction").length, shop: items.filter(i => i.kind === "shop" && i.remaining > 0).length, give: st().recipients.length };
    if (v() === "a") return `<div class="g-seg" role="tablist" aria-label="Browse">${FILTERS.map(([id, label]) =>
      `<button role="tab" aria-selected="${ui.filter === id}" class="${ui.filter === id ? "on" : ""}" data-act="filter" data-v="${id}">${label}</button>`).join("")}</div>`;
    const sub = { bid: `${counts.bid} items`, shop: `${counts.shop} in stock`, give: `${counts.give} causes` };
    const icon = { bid: I.gavel, shop: I.bag, give: I.heart };
    return `<div class="g-modes" role="tablist" aria-label="Browse">${FILTERS.map(([id, label]) =>
      `<button role="tab" aria-selected="${ui.filter === id}" class="g-mode m-${id}${ui.filter === id ? " on" : ""}" data-act="filter" data-v="${id}">${icon[id](20)}<b>${label}</b><small>${sub[id]}</small></button>`).join("")}</div>`;
  }

  function chips(list) {
    const cats = ["All", ...new Set(list.map(i => i.category).filter(Boolean))];
    if (!cats.includes(ui.cat)) ui.cat = "All";
    return `<div class="g-chips" role="group" aria-label="Category">${cats.map(c => {
      const n = c === "All" ? list.length : list.filter(i => i.category === c).length;
      return `<button class="g-chip${ui.cat === c ? " on" : ""}" data-act="cat" data-v="${h(c)}">${h(c)}${c === "All" ? "" : `<i>${n}</i>`}</button>`;
    }).join("")}</div>`;
  }
  const filtered = kind => st().items.filter(i => i.ready && i.kind === kind && (ui.cat === "All" || i.category === ui.cat) &&
    (!ui.q || `${i.title} ${i.donor}`.toLowerCase().includes(ui.q.toLowerCase())));

  function stockLine(i) {
    if (!i.remaining) return `<span class="stock out">Sold out</span>`;
    if (i.remaining <= 3) return `<span class="stock low">Only ${i.remaining} left</span>`;
    return `<span class="stock">${i.remaining} left</span>`;
  }
  function bidState(i) {
    const s = standing(i);
    if (s.leaderIsMe) return `<span class="pill lead">Leading</span>`;
    if (s.mine.length) return `<span class="pill out">Outbid</span>`;
    return "";
  }

  // ------------------------------------------------------------------ Browse
  function browse() {
    const intro = {
      bid: `<p class="sub">${endsLine()}</p>`,
      shop: `<p class="sub">Fixed prices, limited stock. Buy now, pay and pick up at the show.</p>`,
      give: `<p class="sub">${givenLine()}</p>`,
    }[ui.filter];
    const head = v() === "a" ? `${seg()}<section class="g-pagehead">${intro}</section>` : `${seg()}`;
    if (ui.filter === "give") return head + give();
    const kind = ui.filter === "bid" ? "auction" : "shop";
    const all = st().items.filter(i => i.ready && i.kind === kind), list = filtered(kind);
    const tools = `<div class="g-search">${I.search(18)}<input type="search" placeholder="${kind === "shop" ? "Search gifts, makers" : "Search items, providers"}" value="${h(ui.q)}" data-act="q" aria-label="Search"></div>${chips(all)}`;
    let body;
    if (kind === "auction") body = v() === "a" ? list.map(cardA).join("") : `<ul class="g-rows">${list.map(rowB).join("")}</ul>`;
    else body = v() === "a" ? list.map(shopCardA).join("") : `<div class="g-grid">${list.map(shopCardB).join("")}</div>`;
    if (!list.length) body = `<div class="g-empty">Nothing matches. <button class="link" data-act="clear">Clear filters</button></div>`;
    const summary = v() === "a" && kind === "auction" ? myBidStrip() : "";
    return `${head}${summary}${tools}<div class="g-list">${body}</div>`;
  }
  function myBidStrip() {
    const mine = st().items.filter(i => i.kind === "auction" && standing(i).mine.length);
    if (!mine.length) return "";
    const lead = mine.filter(i => standing(i).leaderIsMe).length, out = mine.length - lead;
    return `<button class="g-strip" data-act="tab" data-v="mine"><span>${lead ? `<i class="dot g"></i>${lead} leading` : ""}${out ? ` <i class="dot r"></i>${out} outbid` : ""}</span><span>Mine ${I.chevR(16)}</span></button>`;
  }
  function cardA(i) {
    const s = standing(i), watching = st().watching.includes(i.id);
    return `<article class="card-a"><button class="card-hit" data-act="open" data-v="${i.id}" aria-label="${h(i.title)}"></button>
      <div class="card-media">${photo(i)}<span class="card-no"><small>ITEM</small>${String(i.number).padStart(2, "0")}</span>
        <button class="card-save${watching ? " on" : ""}" data-act="watch" data-v="${i.id}" aria-pressed="${watching}" aria-label="Watch">${I.bookmark(18, watching)}</button>
        <span class="card-donor"><i>${initials(i.donor)}</i>${h(i.donor)}</span></div>
      <div class="card-body"><h3>${h(i.title)}</h3><p>${h(i.short)}</p>
        <div class="card-foot"><div><span class="lbl">${s.count ? "Top bid" : "Starting bid"}</span><span class="amt">${money(s.top?.amountMinor ?? i.openingMinor)}</span><small>${s.count ? `${s.count} bid${s.count > 1 ? "s" : ""}` : "No bids yet"}</small></div>${bidState(i)}</div></div></article>`;
  }
  function shopCardA(i) {
    return `<article class="card-a shop${i.remaining ? "" : " gone"}"><button class="card-hit" data-act="open" data-v="${i.id}" aria-label="${h(i.title)}"></button>
      <div class="card-media">${tile(i)}<span class="card-donor"><i>${initials(i.donor)}</i>${h(i.donor)}</span></div>
      <div class="card-body"><h3>${h(i.title)}</h3><p>${h(i.short)}</p>
        <div class="card-foot"><div><span class="lbl">Price</span><span class="amt">${money(i.priceMinor)}</span>${stockLine(i)}</div>
        ${i.remaining && st().windowOpen ? `<button class="btn buy" data-act="buy" data-v="${i.id}">Buy</button>` : ""}</div></div></article>`;
  }
  function rowB(i) {
    const s = standing(i);
    return `<li class="row-b"><button class="row-hit" data-act="open" data-v="${i.id}" aria-label="${h(i.title)}"></button>
      <div class="row-ph">${photo(i)}</div>
      <div class="row-main"><b>${h(i.title)}</b><small>${h(i.donor)}</small>
        <span class="row-amt"><span class="amt">${money(s.top?.amountMinor ?? i.openingMinor)}</span><em>${s.count ? `${s.count} bid${s.count > 1 ? "s" : ""}` : "to start"}</em></span></div>
      <div class="row-side">${bidState(i) || `<span class="row-next">Bid ${money(s.next)}</span>`}</div></li>`;
  }
  function shopCardB(i) {
    return `<article class="shop-b${i.remaining ? "" : " gone"}"><button class="card-hit" data-act="open" data-v="${i.id}" aria-label="${h(i.title)}"></button>
      ${tile(i)}<div class="shop-b-body"><b>${h(i.title)}</b><span class="shop-b-line"><span class="amt">${money(i.priceMinor)}</span>${stockLine(i)}</span></div>
      ${i.remaining && st().windowOpen ? `<button class="shop-b-add" data-act="buy" data-v="${i.id}" aria-label="Buy ${h(i.title)}">${I.plus(18)}</button>` : ""}</article>`;
  }

  // ------------------------------------------------------------------ Give
  function givenLine() {
    const g = myPledges().reduce((s, p) => s + p.amountMinor, 0);
    return g ? `You&rsquo;ve given <b>${money(g)}</b> tonight. Thank you.` : "Any amount helps.";
  }
  function give() {
    const g = ui.give, recs = st().recipients;
    if (g.step === "done") return `<div class="thanks"><span class="thanks-ic">${I.heart(36, true)}</span><h2>Thank you, ${h(person(ME).name.split(" ")[0])}</h2>
      <p><b>${money(g.last.amountMinor)}</b> to <b>${h(g.last.name)}</b> is recorded. Staff process donations after the event.</p>
      <div class="row-btns"><button class="btn quiet" data-act="give-again">Give again</button><button class="btn primary" data-act="filter" data-v="bid">Back to bidding</button></div></div>`;
    const value = g.amount ?? Math.round(parseFloat(g.custom || "0") * 100);
    const chosen = recs.find(r => r.id === g.recipient);
    if (v() === "b") {
      return `<p class="g-give-intro">${givenLine()}</p><div class="causes">${recs.map((r, n) => `<section class="cause c${n}${g.recipient === r.id ? " on" : ""}">
        <div class="cause-top"><span class="cause-mark">${initials(r.name)}</span><div><b>${h(r.name)}</b><small>${h(r.blurb)}</small></div></div>
        <div class="cause-amts">${[2500, 5000, 10000].map(a => `<button class="cause-amt${g.recipient === r.id && g.amount === a ? " on" : ""}" data-act="give-pick" data-r="${r.id}" data-v="${a}">${money(a)}</button>`).join("")}<button class="cause-amt other${g.recipient === r.id && g.amount == null ? " on" : ""}" data-act="give-pick" data-r="${r.id}" data-v="other">Other</button></div>
        ${g.recipient === r.id ? `${g.amount == null ? `<label class="g-money"><span>$</span><input inputmode="decimal" data-act="give-custom" value="${h(g.custom)}" aria-label="Amount" placeholder="0"></label>` : ""}
          ${giveConfirm(value, r)}` : ""}</section>`).join("")}</div><p class="g-fine">Donations close ${clock(st().event.endsAt)}. Pledges are collected by staff after the event.</p>`;
    }
    return `<div class="give-a"><h3 class="step"><i>1</i>Choose a cause</h3>${recs.map(r => `<button class="cause-row${g.recipient === r.id ? " on" : ""}" data-act="give-rec" data-v="${r.id}"><span class="cause-mark">${initials(r.name)}</span><b>${h(r.name)}</b><span class="radio" aria-hidden="true"></span></button>`).join("")}
      <h3 class="step"><i>2</i>Pick an amount</h3><div class="amts">${[2500, 5000, 10000].map(a => `<button class="amt-btn${g.amount === a ? " on" : ""}" data-act="give-amt" data-v="${a}">${money(a)}</button>`).join("")}</div>
      <span class="lbl">Or another amount</span><label class="g-money"><span>$</span><input inputmode="decimal" data-act="give-custom" value="${h(g.custom)}" aria-label="Another amount" placeholder="0"></label>
      ${chosen ? giveConfirm(value, chosen) : `<button class="btn block" disabled>Choose a cause</button>`}
      <p class="g-fine">Donations close ${clock(st().event.endsAt)}.</p></div>`;
  }
  function giveConfirm(value, r) {
    const g = ui.give, ok = value >= 100 && value <= 1000000;
    if (g.step === "review") return `<div class="review"><p>Give <b>${money(value)}</b> to <b>${h(r.name)}</b>?</p><div class="row-btns"><button class="btn quiet" data-act="give-back">Change</button><button class="btn primary" data-act="give-send">Confirm gift</button></div></div>`;
    if (g.step === "sending") return `<button class="btn primary block" disabled><span class="spin"></span>Confirming…</button>`;
    return `<button class="btn primary block" data-act="give-review" ${ok ? "" : "disabled"}>${ok ? `Give ${money(value)}` : "Enter an amount"}</button>`;
  }

  // ------------------------------------------------------------------ Item page
  function itemPage(i) {
    if (i.kind === "shop") {
      const max = canBuyUpTo(i), mine = held(i.id);
      return `<article class="ip shop"><div class="ip-media">${tile(i, "big")}</div>
        <div class="ip-body"><span class="ip-donor"><i>${initials(i.donor)}</i>${h(i.donor)}</span><h1>${h(i.title)}</h1><p>${h(i.short)}</p>
        <div class="ip-price"><span class="amt xl">${money(i.priceMinor)}</span>${stockLine(i)}</div>
        <ul class="ip-facts">
          ${i.pickup ? `<li>${I.pin(18)}<span><b>Pick up</b>${h(i.pickup)}</span></li>` : ""}
          ${i.limit != null ? `<li>${I.bag(18)}<span><b>Limit ${i.limit} per guest</b>${mine ? `You have ${mine}.` : "Pay staff when you collect."}</span></li>` : `<li>${I.bag(18)}<span><b>Pay at pickup</b>Staff collect payment when you collect.</span></li>`}
        </ul>
        ${mine ? `<div class="ip-mine">${I.check(18)} You bought ${mine}. <button class="link" data-act="tab" data-v="mine">See in Mine</button></div>` : ""}
        </div></article>
        <div class="ip-cta">${!st().windowOpen ? `<button class="btn block" disabled>Buying has closed</button>` :
          !i.remaining ? `<button class="btn block" disabled>Sold out</button>` :
          !max ? `<button class="btn block" disabled>You&rsquo;ve reached the limit</button>` :
          `<button class="btn primary block" data-act="buy" data-v="${i.id}">Buy · ${money(i.priceMinor)}</button>`}</div>`;
    }
    const s = standing(i), watching = st().watching.includes(i.id);
    return `<article class="ip"><div class="ip-media"><img src="img/${i.photo}.jpg" alt=""><button class="card-save${watching ? " on" : ""}" data-act="watch" data-v="${i.id}" aria-pressed="${watching}" aria-label="Watch">${I.bookmark(18, watching)}</button></div>
      <div class="ip-body"><span class="ip-donor"><i>${initials(i.donor)}</i>${h(i.donor)}</span><h1>${h(i.title)}</h1><p>${h(i.short)}</p>
      <div class="ip-price"><div><span class="lbl">${s.count ? "Top bid" : "Starting bid"}</span><span class="amt xl">${money(s.top?.amountMinor ?? i.openingMinor)}</span></div>${bidState(i)}</div>
      <ul class="ip-facts"><li>${I.clock(18)}<span><b>Ends ${clock(st().event.endsAt)}</b>${timeLeft()} left</span></li>
        ${s.top ? `<li>${I.gavel(18)}<span><b>${s.leaderIsMe ? "You&rsquo;re leading" : h(person(s.top.who).business)}</b>${s.count} bid${s.count > 1 ? "s" : ""} so far</span></li>` : ""}</ul></div></article>
      <div class="ip-cta">${!st().windowOpen ? `<button class="btn block" disabled>Bidding has closed</button>` : s.leaderIsMe ? `<button class="btn block" disabled>You&rsquo;re the top bidder</button>` :
        `<button class="btn primary block" data-act="bid" data-v="${i.id}">Bid ${money(s.next)}</button>`}</div>`;
  }

  // ------------------------------------------------------------------ Mine
  function mine() {
    const auctionsMine = st().items.filter(i => i.kind === "auction" && standing(i).mine.length);
    const out = auctionsMine.filter(i => !standing(i).leaderIsMe), lead = auctionsMine.filter(i => standing(i).leaderIsMe);
    const buys = myPurchases(), gifts = myPledges(), watching = st().watching.map(itemById).filter(Boolean);
    const totalBuys = buys.filter(p => p.status !== "cancelled").reduce((s, p) => s + p.quantity * p.unitMinor, 0);
    const bidRow = i => { const s = standing(i); return `<li class="m-row"><button class="row-hit" data-act="open" data-v="${i.id}" aria-label="${h(i.title)}"></button><div class="m-ph">${photo(i)}</div><div class="m-main"><b>${h(i.title)}</b><small>${s.leaderIsMe ? `Your bid ${money(s.top.amountMinor)} is the top bid` : `Top bid ${money(s.top.amountMinor)} · yours ${money(s.mine[0].amountMinor)}`}</small></div>${s.leaderIsMe ? `<span class="pill lead">Leading</span>` : `<button class="btn small primary" data-act="bid" data-v="${i.id}">Bid ${money(s.next)}</button>`}</li>`; };
    const buyRow = p => { const i = itemById(p.itemId); return `<li class="m-row${p.status === "cancelled" ? " void" : ""}"><button class="row-hit" data-act="open" data-v="${i.id}" aria-label="${h(i.title)}"></button><div class="m-ph">${tile(i)}</div><div class="m-main"><b>${p.quantity} × ${h(i.title)}</b><small>${money(p.quantity * p.unitMinor)} · ${STATUS[p.status]}</small>${v() === "a" && i.pickup && p.status !== "cancelled" && p.status !== "picked_up" ? `<small class="m-pick">${I.pin(14)}${h(i.pickup)}</small>` : ""}</div></li>`; };
    const giftRow = p => `<li class="m-row"><div class="m-ph heart">${I.heart(20, true)}</div><div class="m-main"><b>${money(p.amountMinor)} to ${h(st().recipients.find(r => r.id === p.recipientId).name)}</b><small>Pledged ${clock(p.at)}</small></div></li>`;
    const section = (title, rows, n, extra = "") => rows.length ? `<section class="m-sec"><h2>${title}${n != null ? ` <i>${n}</i>` : ""}</h2>${extra}<ul>${rows.join("")}</ul></section>` : "";
    let pickups = "";
    if (v() === "b") {
      const open = buys.filter(p => p.status === "committed" || p.status === "paid");
      const byPlace = {};
      for (const p of open) { const i = itemById(p.itemId); (byPlace[i.pickup || "Ask staff"] ??= []).push(p); }
      pickups = Object.keys(byPlace).length ? `<section class="m-sec"><h2>To pick up</h2>${Object.entries(byPlace).map(([place, ps]) => `<div class="pickup"><div class="pickup-where">${I.pin(18)}<b>${h(place)}</b></div><ul>${ps.map(p => { const i = itemById(p.itemId); return `<li><span>${p.quantity} × ${h(i.title)}</span><span>${money(p.quantity * p.unitMinor)}${p.status === "paid" ? ` <em class="paid">Paid</em>` : ""}</span></li>`; }).join("")}</ul></div>`).join("")}</section>` : "";
    }
    const done = v() === "b" ? buys.filter(p => p.status === "picked_up" || p.status === "cancelled") : buys;
    const summary = `<p class="sub">${[lead.length && `${lead.length} leading`, out.length && `${out.length} outbid`, buys.length && `${money(totalBuys)} in purchases`].filter(Boolean).join(" · ") || "Nothing yet. Bids, purchases and gifts show up here."}</p>`;
    return `<section class="g-pagehead"><h1>Mine</h1>${summary}</section>
      ${section("Outbid", out.map(bidRow), out.length)}
      ${pickups}
      ${section("Leading", lead.map(bidRow), lead.length)}
      ${section(v() === "b" ? "Purchase history" : "Purchases", done.map(buyRow), v() === "a" ? done.length : null, v() === "a" && buys.some(p => p.status === "committed") ? `<p class="m-note">Pay staff when you collect. Each item shows where.</p>` : "")}
      ${section("Donations", gifts.map(giftRow), null)}
      ${section("Watching", watching.map(watchRow), null)}`;
  }
  function watchRow(i) {
    const line = i.kind === "auction" ? `Top bid ${money(standing(i).top?.amountMinor ?? i.openingMinor)}` : money(i.priceMinor);
    return `<li class="m-row"><button class="row-hit" data-act="open" data-v="${i.id}" aria-label="${h(i.title)}"></button><div class="m-ph">${photo(i)}</div><div class="m-main"><b>${h(i.title)}</b><small>${line}</small></div>${I.chevR(18)}</li>`;
  }

  // ------------------------------------------------------------------ Event
  function eventPage() {
    const e = st().event;
    return `<section class="ev-hero"><span class="eyebrow">Welcome</span><h1>${h(e.name)}</h1><p>${endsLine()}</p></section>
      <dl class="ev-facts"><div><dt>Where</dt><dd>${h(e.venue)}</dd></div><div><dt>Bidding</dt><dd>${clock(e.startsAt)} – ${clock(e.endsAt)}</dd></div><div><dt>Code</dt><dd>${h(e.code)}</dd></div></dl>
      <section class="ev-how"><h2>Three ways to take part</h2>
        <button class="how" data-act="jump" data-v="bid">${I.gavel(22)}<span><b>Bid</b>Silent auction. Highest bid when bidding ends wins.</span>${I.chevR(18)}</button>
        <button class="how" data-act="jump" data-v="shop">${I.bag(22)}<span><b>Shop</b>Fixed prices, limited stock. Pay and pick up at the show.</span>${I.chevR(18)}</button>
        <button class="how" data-act="jump" data-v="give">${I.heart(22)}<span><b>Give</b>Donate any amount to tonight&rsquo;s causes.</span>${I.chevR(18)}</button></section>`;
  }

  // ------------------------------------------------------------------ Sheets
  function sheet() {
    const sh = ui.sheet; if (!sh) return "";
    const i = itemById(sh.itemId);
    let body;
    if (sh.kind === "buy") {
      const max = Math.max(1, canBuyUpTo(i)), q = sh.step === "pick" ? Math.min(sh.qty, max) : sh.qty, total = q * i.priceMinor;
      if (sh.step === "done") body = `<div class="sh-done"><span class="sh-ok">${I.check(30)}</span><h2>Purchased</h2><p><b>${sh.receipt.quantity} × ${h(i.title)}</b> · ${money(sh.receipt.amountMinor)}</p>
          ${i.pickup ? `<p class="sh-pick">${I.pin(18)}<span>Pick up and pay at <b>${h(i.pickup)}</b></span></p>` : ""}
          <div class="row-btns"><button class="btn quiet" data-act="sheet-close">Keep shopping</button><button class="btn primary" data-act="sheet-mine">See in Mine</button></div></div>`;
      else if (sh.step === "refused") body = refused(sh, i);
      else if (sh.step === "uncertain") body = `<div class="sh-done"><span class="sh-warn">${I.wifiOff(28)}</span><h2>We lost the connection</h2><p>Your purchase may have gone through. Check before trying anything else. It won&rsquo;t be bought twice.</p>
          <button class="btn primary block" data-act="buy-check" ${sh.checking ? "disabled" : ""}>${sh.checking ? `<span class="spin"></span>Checking…` : "Check my purchase"}</button></div>`;
      else if (sh.step === "review" || sh.step === "sending") body = `<div class="sh-head">${tile(i, "sm")}<div><b>${h(i.title)}</b><small>${h(i.donor)}</small></div></div>
          <dl class="sh-sum"><div><dt>${q} × ${money(i.priceMinor)}</dt><dd>${money(total)}</dd></div><div><dt>Pay</dt><dd>At pickup, to staff</dd></div>${i.pickup ? `<div><dt>Pick up</dt><dd>${h(i.pickup)}</dd></div>` : ""}</dl>
          <p class="sh-fine">Purchases are final. Ask staff if something&rsquo;s wrong.</p>
          <div class="row-btns"><button class="btn quiet" data-act="buy-edit" ${sh.step === "sending" ? "disabled" : ""}>Change</button><button class="btn primary" data-act="buy-send" ${sh.step === "sending" ? "disabled" : ""}>${sh.step === "sending" ? `<span class="spin"></span>Confirming…` : `Confirm ${money(total)}`}</button></div>`;
      else body = `<div class="sh-head">${tile(i, "sm")}<div><b>${h(i.title)}</b><small>${money(i.priceMinor)} each · ${i.remaining} left</small></div></div>
          <div class="sh-qty"><span class="lbl">How many?</span><div class="stepper"><button data-act="qty" data-v="-1" aria-label="Fewer" ${q <= 1 ? "disabled" : ""}>${I.minus(20)}</button><output aria-live="polite">${q}</output><button data-act="qty" data-v="1" aria-label="More" ${q >= max ? "disabled" : ""}>${I.plus(20)}</button></div></div>
          <p class="sh-limit">${i.limit != null ? `Limit ${i.limit} per guest${held(i.id) ? ` · you have ${held(i.id)}` : ""}` : `Up to ${i.remaining} available`}</p>
          <button class="btn primary block" data-act="buy-review">Review · ${money(total)}</button>`;
    } else {
      const s = standing(i), opts = [s.next, s.next + i.increment, s.next + 2 * i.increment];
      if (sh.step === "done") body = `<div class="sh-done"><span class="sh-ok">${I.check(30)}</span><h2>You&rsquo;re the top bidder</h2><p><b>${money(sh.amount)}</b> on ${h(i.title)}. We&rsquo;ll tell you if someone outbids you.</p><button class="btn primary block" data-act="sheet-close">Done</button></div>`;
      else if (sh.step === "refused") body = `<div class="sh-done"><span class="sh-warn">${I.x(26)}</span><h2>Someone bid first</h2><p>The next bid is now ${money(s.next)}.</p><button class="btn primary block" data-act="bid-reset">Bid ${money(s.next)}</button></div>`;
      else body = `<div class="sh-head"><img src="img/${i.photo}.jpg" alt=""><div><b>${h(i.title)}</b><small>Top bid ${money(s.top?.amountMinor ?? i.openingMinor)}</small></div></div>
          <div class="bid-opts">${opts.map(a => `<button class="amt-btn${sh.amount === a ? " on" : ""}" data-act="bid-amt" data-v="${a}" ${sh.step === "sending" ? "disabled" : ""}>${money(a)}</button>`).join("")}</div>
          <button class="btn primary block" data-act="bid-send" ${sh.step === "sending" ? "disabled" : ""}>${sh.step === "sending" ? `<span class="spin"></span>Placing bid…` : `Bid ${money(sh.amount)}`}</button>`;
    }
    return `<div class="sh-scrim" data-act="sheet-close"></div><section class="sheet" role="dialog" aria-modal="true" aria-label="${sh.kind === "buy" ? "Buy" : "Bid"}"><span class="sh-grab" aria-hidden="true"></span><button class="sh-x" data-act="sheet-close" aria-label="Close">${I.x(20)}</button>${body}</section>`;
  }
  function refused(sh, i) {
    const r = sh.receipt;
    const text = {
      SOLD_OUT: ["Just sold out", "Someone else got the last one. Nothing was charged or reserved."],
      NOT_ENOUGH: [`Only ${r.left} left now`, `Others bought some while you were deciding. You can still get ${r.left}.`],
      LIMIT_REACHED: ["You&rsquo;ve reached the limit", r.left ? `You can buy ${r.left} more.` : `The limit is ${i.limit} per guest.`],
      CLOSED: ["Buying has closed", "Purchases you already made still stand."],
      NOT_AVAILABLE: ["This item isn&rsquo;t available", "Staff may have removed it."],
    }[r.reason] ?? ["Not completed", "Try again."];
    const retry = (r.reason === "NOT_ENOUGH" || r.reason === "LIMIT_REACHED") && r.left > 0;
    return `<div class="sh-done"><span class="sh-warn">${I.x(26)}</span><h2>${text[0]}</h2><p>${text[1]}</p>${retry ? `<button class="btn primary block" data-act="buy-fix" data-v="${r.left}">Buy ${r.left} instead</button>` : `<button class="btn block" data-act="sheet-close">Close</button>`}</div>`;
  }

  // ------------------------------------------------------------------ render + events
  function render() {
    const item = ui.item ? itemById(ui.item) : null;
    const screen = item ? itemPage(item) : ui.tab === "mine" ? mine() : ui.tab === "event" ? eventPage() : browse();
    const focused = document.activeElement?.dataset?.act === "q";
    const y = root.querySelector(".g-main")?.scrollTop ?? 0;
    root.className = `g g-${v()}`;
    root.innerHTML = `${header()}${!st().windowOpen && !item ? `<div class="g-closed">${I.clock(16)} Bidding and buying have closed.</div>` : ""}<main class="g-main" data-screen="${item ? "item" : ui.tab}"><div class="g-screen">${screen}</div></main>${item ? "" : nav()}${sheet()}${ui.toast ? `<div class="g-toast" role="status">${ui.toast}</div>` : ""}`;
    const m = root.querySelector(".g-main"); if (m) m.scrollTop = y;
    if (focused) { const q = root.querySelector('[data-act="q"]'); q?.focus(); q?.setSelectionRange(q.value.length, q.value.length); }
  }

  function openSheet(kind, itemId) {
    const i = itemById(itemId);
    ui.sheet = kind === "buy" ? { kind, itemId, qty: 1, step: "pick", requestId: null } : { kind, itemId, amount: standing(i).next, step: "pick", requestId: rid() };
    render();
    root.querySelector(".sheet button:not(.sh-x)")?.focus();
  }
  async function sendBuy() {
    const sh = ui.sheet, i = itemById(sh.itemId);
    sh.requestId ??= rid(); // one request id per confirmed intent; retries reuse it
    sh.step = "sending"; render();
    try {
      const r = await buy(i.id, sh.qty, sh.requestId);
      settle(r);
    } catch { sh.step = "uncertain"; render(); }
  }
  function settle(r) {
    const sh = ui.sheet; if (!sh) return;
    if (r.accepted) { sh.step = "done"; sh.receipt = r; sh.requestId = null; }
    else { sh.step = "refused"; sh.receipt = r; sh.requestId = null; }
    render();
  }

  root.addEventListener("click", async e => {
    const el = e.target.closest("[data-act]"); if (!el || el.disabled) return;
    const act = el.dataset.act, val = el.dataset.v;
    if (["q", "give-custom"].includes(act)) return;
    e.preventDefault();
    switch (act) {
      case "tab": go({ tab: val, item: null, sheet: null }); break;
      case "filter": go({ tab: "browse", filter: val, item: null, cat: "All", q: "" }); ui.give.step = ui.give.step === "done" ? "pick" : ui.give.step; break;
      case "jump": go({ tab: "browse", filter: val, item: null }); break;
      case "cat": ui.cat = val; render(); break;
      case "clear": ui.cat = "All"; ui.q = ""; render(); break;
      case "open": go({ item: val }); break;
      case "back": history.back(); break;
      case "watch": { const on = !st().watching.includes(val); watch(val, on); toast(on ? "Added to Watching in Mine" : "Removed from Watching"); break; }
      case "buy": openSheet("buy", val); break;
      case "bid": openSheet("bid", val); break;
      case "sheet-close": ui.sheet = null; render(); break;
      case "sheet-mine": ui.sheet = null; go({ tab: "mine", item: null }); break;
      case "qty": ui.sheet.qty = Math.min(Math.max(1, canBuyUpTo(itemById(ui.sheet.itemId))), Math.max(1, ui.sheet.qty + Number(val))); render(); break;
      case "buy-review": ui.sheet.step = "review"; render(); break;
      case "buy-edit": ui.sheet.step = "pick"; render(); break;
      case "buy-send": sendBuy(); break;
      case "buy-fix": ui.sheet.qty = Number(val); ui.sheet.step = "review"; render(); break;
      case "buy-check": {
        const sh = ui.sheet; sh.checking = true; render();
        const r = await receiptOf(sh.requestId); sh.checking = false;
        if (r) settle(r); else { sh.step = "review"; render(); } // never arrived: confirming again reuses the same request id
        break;
      }
      case "bid-amt": ui.sheet.amount = Number(val); render(); break;
      case "bid-reset": { const i = itemById(ui.sheet.itemId); ui.sheet = { kind: "bid", itemId: i.id, amount: standing(i).next, step: "pick", requestId: rid() }; render(); break; }
      case "bid-send": {
        const sh = ui.sheet; sh.step = "sending"; render();
        const r = await bid(sh.itemId, sh.amount, sh.requestId);
        if (!ui.sheet) return;
        sh.step = r.accepted ? "done" : "refused"; render(); break;
      }
      case "give-rec": ui.give.recipient = val; ui.give.step = "pick"; render(); break;
      case "give-amt": ui.give.amount = Number(val); ui.give.custom = ""; ui.give.step = "pick"; render(); break;
      case "give-pick": ui.give.recipient = el.dataset.r; ui.give.amount = val === "other" ? null : Number(val); ui.give.step = "pick"; render(); break;
      case "give-review": ui.give.step = "review"; render(); break;
      case "give-back": ui.give.step = "pick"; render(); break;
      case "give-send": {
        const g = ui.give, value = g.amount ?? Math.round(parseFloat(g.custom || "0") * 100);
        g.requestId ??= rid(); g.step = "sending"; render();
        await pledge(g.recipient, value, g.requestId);
        g.last = { amountMinor: value, name: st().recipients.find(r => r.id === g.recipient).name }; g.requestId = null; g.step = "done"; render(); break;
      }
      case "give-again": ui.give = { recipient: null, amount: 5000, custom: "", step: "pick" }; render(); break;
    }
  });
  root.addEventListener("input", e => {
    const act = e.target.dataset.act;
    if (act === "q") { ui.q = e.target.value; render(); }
  });
  root.addEventListener("change", e => {
    if (e.target.dataset.act === "give-custom") { ui.give.custom = e.target.value.replace(/[^0-9.]/g, ""); ui.give.amount = null; render(); }
  });
  root.addEventListener("keydown", e => { if (e.key === "Escape" && ui.sheet) { ui.sheet = null; render(); } });

  return { render };
}
