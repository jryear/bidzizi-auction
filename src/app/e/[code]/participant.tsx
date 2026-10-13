"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dollarsInput, errorText, fmtClock, fmtTime, initials, newId, Offline, parseDollars, untilText } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import "./participant-design.css";

type Item = {
  id: string; position: number; title: string; short: string; description: string; category: string; donor: string; imageUrl: string | null;
  openingMinor: number; opensAt: string; closesAt: string; phase: "scheduled" | "open" | "closed";
  currentMinor: number | null; bidCount: number; leader: { name: string; business: string; isMe: boolean } | null;
  minimumNextMinor: number | null; incrementMinor: number; watching: boolean; myHighestMinor: number | null; myBidCount: number;
  withdrawn?: boolean; withdrawalMessage?: string; bidHistory?: { id: string; amountMinor: number; decidedAt: string; isMe: boolean; voided: boolean }[];
  award: { status: string; winner: { name: string; business: string } | null; amountMinor: number | null; isMe: boolean } | null;
};
type Snapshot = {
  serverNow: string; preview?: boolean;
  event: { id: string; code: string; name: string; welcome: string; venue: string; timezone: string; theme?: string; coverUrl: string | null; startsAt: string; endsAt: string;
    entryOpen: boolean; phase: "upcoming" | "open" | "closed"; sponsors: { name: string; logoUrl: string | null }[];
    donations: { enabled: boolean; open: boolean; deadline: string | null; capMinor: number; recipients: { id: string; name: string; description: string; logoUrl: string | null }[] } };
  items: Item[];
  me: null | { id: string; displayName: string; businessName: string; canBid: boolean; winnerInstructions: string;
    pledges: { id: string; recipientName: string; amountMinor: number; recordedAt: string }[] };
};
type Receipt = { requestId: string; itemId: string; amountMinor: number; accepted: boolean; reason: string | null; currentMinor: number | null; minimumNextMinor: number | null };
type Tab = "items" | "watching" | "mine" | "event" | "give";
type PendingBid = { requestId: string; itemId: string; amountMinor: number };

const REASONS: Record<string, string> = {
  NOT_AVAILABLE: "This item isn't available for bidding.",
  NOT_OPEN: "Bidding on this item hasn't opened yet.",
  CLOSED: "Bidding on this item has closed.",
  BIDDING_PAUSED: "Your bidding is paused. Talk to the event staff.",
  ALREADY_LEADING: "You're already the highest bidder.",
  BELOW_MINIMUM: "Someone bid first — the minimum went up.",
  AMOUNT_LIMIT: "This amount is above the limit.",
};

function status(item: Item): { label: string; tone: string } | null {
  const myHistory = item.bidHistory?.filter(b => b.isMe) ?? [];
  if (item.myBidCount === 0 && myHistory.length > 0 && myHistory.every(b => b.voided) && item.phase === "open") return { label: "Your bids were voided", tone: "closed" };
  if (item.phase === "scheduled") return { label: `Opens ${fmtClock(item.opensAt)}`, tone: "upcoming" };
  if (item.phase === "open") {
    if (item.leader?.isMe) return { label: "You're leading", tone: "leading" };
    if (item.myBidCount > 0) return { label: "Outbid", tone: "outbid" };
    return null;
  }
  if (item.award?.isMe) return { label: "You won", tone: "won" };
  if (item.award && item.award.status !== "no_winner") return { label: "Sold", tone: "closed" };
  if (!item.award && item.leader?.isMe) return { label: "Highest bid · awaiting confirmation", tone: "pending" };
  return { label: "Closed", tone: "closed" };
}

export default function Participant({ code }: { code: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [offsetMs, setOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("items");
  const [openId, setOpenId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Item | null>(null);
  const [toast, setToast] = useState("");
  const pendingKey = `bz_pending_${code}`;

  const load = useCallback(async () => {
    try {
      const r = await api<Snapshot>("GET", `/api/v1/e/${code}`);
      if (r.status === 404) { setMissing(true); return; }
      if (!r.ok) { setOffline(true); return; }
      setSnap(r.data); setOffline(false);
      setOffsetMs(new Date(r.data.serverNow).getTime() - Date.now());
    } catch { setOffline(true); }
  }, [code]);

  useEffect(() => {
    load();
    const poll = setInterval(() => { if (document.visibilityState === "visible") load(); }, 4000);
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    const wake = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", wake); window.addEventListener("online", wake);
    return () => { clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [load]);

  // Back closes the item page / sheet instead of leaving the event.
  useEffect(() => {
    const onPop = () => { if (sheet) setSheet(null); else setOpenId(null); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [sheet]);
  const openItem = (id: string) => { history.pushState({ item: id }, ""); setOpenId(id); window.scrollTo(0, 0); };
  const openSheet = (item: Item) => { history.pushState({ sheet: item.id }, ""); setSheet(item); };
  const closeLayer = () => history.back();

  const flash = (text: string) => { setToast(text); setTimeout(() => setToast(""), 3200); };
  const serverNow = nowMs + offsetMs;

  if (missing) return (
    <main className="phone" data-theme={snap?.event.theme}><div className="screen" style={{ justifyContent: "center", textAlign: "center" }}>
      <h1>Event not found</h1><p className="muted">This event isn't available. Check the code with the host.</p>
      <a className="btn primary" href="/join">Enter a code</a></div></main>
  );
  if (!snap) return <main className="phone"><div className="screen" style={{ justifyContent: "center", textAlign: "center" }}><p className="muted">{offline ? "Can't reach the event. Retrying…" : "Loading event…"}</p></div></main>;
  if (!snap.me) return <JoinForm snap={snap} code={code} onJoined={load} />;

  const me = snap.me;
  const current = openId ? snap.items.find(i => i.id === openId) ?? null : null;
  const sheetItem = sheet ? snap.items.find(i => i.id === sheet.id) ?? sheet : null;
  const attention = snap.items.some(i => i.phase === "open" && i.myBidCount > 0 && !i.leader?.isMe) || snap.items.some(i => i.award?.isMe);

  return (
    <main className="phone participant-app" data-theme={snap?.event.theme}>
      {!current && <header className="pass">
        <span className="mono" aria-hidden="true">{initials(me.businessName)}</span>
        <div className="who"><b>{me.businessName}</b><span>{me.displayName}</span></div>
        <span className="event">{snap.event.name}</span>
      </header>}
      {offline && <p className="notice warn offline" role="status">Connection lost — showing standings as of {fmtClock(snap.serverNow, snap.event.timezone)}. Reconnecting…</p>}

      {current ? (
        <ItemPage item={current} snap={snap} serverNow={serverNow} onBack={closeLayer} onBid={() => openSheet(current)}
          onWatch={async on => { await api("POST", `/api/v1/e/${code}/watch`, { itemId: current.id, on }).catch(() => {}); load(); }} />
      ) : (
        <div className="screen">
          {tab === "items" && <Catalog snap={snap} serverNow={serverNow} onOpen={openItem} onWatch={(item, on) => watchItem(code, item, on, load)} />}
          {tab === "watching" && <ItemList title="Watching" empty="Tap the bookmark on any item to keep it here." items={snap.items.filter(i => i.watching)} serverNow={serverNow} onOpen={openItem} onWatch={(item, on) => watchItem(code, item, on, load)} />}
          {tab === "mine" && <MyBids snap={snap} serverNow={serverNow} onOpen={openItem} onBid={openSheet} />}
          {tab === "event" && <EventInfo snap={snap} />}
          {tab === "give" && <Give snap={snap} code={code} onDone={(text) => { flash(text); load(); }} />}
        </div>
      )}

      {!current && (
        <nav className="tabs" aria-label="Sections">
          {(["items", "watching", "mine", ...(snap.event.donations.enabled ? ["give"] : []), "event"] as Tab[]).map(t => (
            <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => { setTab(t); window.scrollTo(0, 0); }}>
              <TabIcon name={t} />
              <span>{{ items: "Items", watching: "Watching", mine: "My bids", event: "Event", give: "Donate" }[t]}</span>
              {t === "mine" && attention && <span className="dot" aria-label="needs attention" />}
            </button>
          ))}
        </nav>
      )}

      {sheetItem && <BidSheet item={sheetItem} me={me} code={code} pendingKey={pendingKey} onClose={closeLayer}
        onResult={(text) => { flash(text); load(); }} />}
      <ResumePending code={code} pendingKey={pendingKey} onResolved={(text) => { flash(text); load(); }} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

// ---------------------------------------------------------------- join

function JoinForm({ snap, code, onJoined }: { snap: Snapshot; code: string; onJoined: () => void }) {
  if (snap.preview) return <PreviewCatalog snap={snap} />;
  const key = `bz_join_${code}`;
  const [name, setName] = useState(""), [business, setBusiness] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [rejoin, setRejoin] = useState(false), [rejoinCode, setRejoinCode] = useState("");
  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !business.trim()) { setError("Enter your name and business."); return; }
    setBusy(true); setError("");
    // Reuse the same request id if a previous attempt's response was lost.
    const requestId = sessionStorage.getItem(key) ?? newId();
    sessionStorage.setItem(key, requestId);
    try {
      const r = await api("POST", `/api/v1/e/${code}/join`, { requestId, displayName: name, businessName: business });
      if (r.ok) { sessionStorage.removeItem(key); onJoined(); }
      else { setError(errorText(r)); if (r.status !== 503) sessionStorage.removeItem(key); }
    } catch (e) { setError(e instanceof Offline ? "Connection lost. Tap Join again — you won't be added twice." : "Something went wrong."); }
    finally { setBusy(false); }
  }
  async function useRejoin(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const r = await api("POST", `/api/v1/e/${code}/rejoin`, { code: rejoinCode });
      if (r.ok) onJoined(); else setError(errorText(r));
    } catch { setError("Connection lost. Try again."); }
    finally { setBusy(false); }
  }
  const e = snap.event;
  return (
    <main className="phone" data-theme={snap?.event.theme}>
      <div className="screen">
        {e.coverUrl && <div className="cover"><img src={e.coverUrl} alt="" /></div>}
        <div className="stack" style={{ gap: 6 }}>
          <span className="small faint">{fmtTime(e.startsAt, e.timezone)}{e.venue ? ` · ${e.venue}` : ""}</span>
          <h1>{e.name}</h1>
          {e.welcome && <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{e.welcome}</p>}
        </div>
        {!e.entryOpen ? <p className="notice warn">Joining is closed for this event.</p> : !rejoin ? (
          <form className="card pad stack" onSubmit={join}>
            <h2>Join the auction</h2>
            <label className="field"><span>Your name</span><input value={name} onChange={x => setName(x.target.value)} maxLength={60} autoComplete="name" /></label>
            <label className="field"><span>Business name</span><input value={business} onChange={x => setBusiness(x.target.value)} maxLength={120} autoComplete="organization" /></label>
            <p className="hint">Shown next to your bids. This device will remember you for this event.</p>
            {error && <p className="notice error" role="alert">{error}</p>}
            <button className="btn primary block" disabled={busy}>{busy ? "Joining…" : "Join"}</button>
            <button type="button" className="btn ghost" onClick={() => { setRejoin(true); setError(""); }}>Already joined on another phone?</button>
          </form>
        ) : (
          <form className="card pad stack" onSubmit={useRejoin}>
            <h2>Continue on this phone</h2>
            <p className="muted small">Ask a staff member for a rejoin code. Your bids and results move to this phone.</p>
            <label className="field"><span>Rejoin code</span><input className="code-input" value={rejoinCode} onChange={x => setRejoinCode(x.target.value)} autoCapitalize="characters" /></label>
            {error && <p className="notice error" role="alert">{error}</p>}
            <button className="btn primary block" disabled={busy}>Continue</button>
            <button type="button" className="btn ghost" onClick={() => setRejoin(false)}>Back</button>
          </form>
        )}
        <Sponsors snap={snap} />
      </div>
    </main>
  );
}

/** Staff preview of a draft: the real catalog, with joining off until the event goes live. */
function PreviewCatalog({ snap }: { snap: Snapshot }) {
  return (
    <main className="phone participant-app" data-theme={snap.event.theme}>
      <p className="notice info" style={{ borderRadius: 0 }}>Preview — only you can see this. People can join once you go live.</p>
      <div className="screen">
        {snap.event.coverUrl && <div className="cover"><img src={snap.event.coverUrl} alt="" /></div>}
        <Catalog snap={snap} serverNow={new Date(snap.serverNow).getTime()} onOpen={() => {}} onWatch={() => {}} />
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- lists

function watchItem(code: string, item: Item, on: boolean, load: () => Promise<void>) {
  return api("POST", `/api/v1/e/${code}/watch`, { itemId: item.id, on }).then(load).catch(() => {});
}

function Catalog({ snap, serverNow, onOpen, onWatch }: { snap: Snapshot; serverNow: number; onOpen: (id: string) => void; onWatch: (item: Item, on: boolean) => void }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState(""), [sort, setSort] = useState("position"), [view, setView] = useState<"large" | "compact">("large");
  const categories = useMemo(() => [...new Set(snap.items.map(i => i.category).filter(Boolean))], [snap.items]);
  const q = query.trim().toLowerCase();
  const shown = snap.items.filter(i => (!category || i.category === category) && (!q || `${i.title} ${i.short} ${i.donor} ${i.category} ${i.position + 1}`.toLowerCase().includes(q)));
  if (sort === "price") shown.sort((a, b) => (a.currentMinor ?? a.openingMinor) - (b.currentMinor ?? b.openingMinor));
  if (sort === "ending") shown.sort((a, b) => a.phase === "open" && b.phase === "open" ? Date.parse(a.closesAt) - Date.parse(b.closesAt) : a.phase === "open" ? -1 : b.phase === "open" ? 1 : a.position - b.position);
  if (sort === "position") shown.sort((a, b) => a.position - b.position);
  const e = snap.event;
  return (
    <section className="participant-catalog">
      <div className="participant-pagehead"><p className="participant-eyebrow">{e.phase === "open" ? "Now open · browse the items" : e.phase === "upcoming" ? "Coming up · get a first look" : "The auction has ended"}</p><h1>{e.name}</h1><p>{e.phase === "open" ? `Bidding ends ${fmtTime(e.endsAt, e.timezone)}` : e.phase === "upcoming" ? `Bidding opens ${fmtTime(e.startsAt, e.timezone)}` : "Final standings are shown below."}</p></div>
      {snap.items.some(i => i.award?.isMe) && <WonBanner snap={snap} />}
      {snap.items.length > 0 && <label className="participant-search"><SearchIcon /><span className="sr">Search items</span><input type="search" placeholder="Search items, provider or category" value={query} onChange={x => setQuery(x.target.value)} aria-label="Search items" /></label>}
      {categories.length > 1 && (
        <div className="participant-chips" role="group" aria-label="Filter by category">
          <button className="participant-chip" aria-pressed={!category} onClick={() => setCategory("")}>All items</button>
          {categories.map(c => <button className="participant-chip" key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}
        </div>
      )}
      <div className="participant-toolbar"><label className="participant-sort"><span className="sr">Sort items</span><select value={sort} onChange={e => setSort(e.target.value)}><option value="position">Item order</option><option value="price">Lowest price</option><option value="ending">Ending soon</option></select><span aria-hidden="true">⌄</span></label><div className="participant-view" role="group" aria-label="Item view"><button aria-pressed={view === "large"} onClick={() => setView("large")} aria-label="Large cards"><GridIcon /></button><button aria-pressed={view === "compact"} onClick={() => setView("compact")} aria-label="Compact list"><ListIcon /></button></div></div>
      <ItemList items={shown} serverNow={serverNow} onOpen={onOpen} onWatch={onWatch} view={view} empty={snap.items.length ? "No items match your search. Try a different category or clear the search." : "Items will appear here soon."} />
    </section>
  );
}

function ItemList({ items, serverNow, onOpen, onWatch, empty, title, view = "compact" }: { items: Item[]; serverNow: number; onOpen: (id: string) => void; onWatch?: (item: Item, on: boolean) => void; empty: string; title?: string; view?: "large" | "compact" }) {
  return (
    <>
      {title && <div className="participant-pagehead participant-listhead"><p className="participant-eyebrow">Your saved items</p><h1>{title}</h1><p>{items.length} {items.length === 1 ? "item" : "items"} · watching is private to this device</p></div>}
      {!items.length && <div className="participant-empty"><b>{empty}</b>{title === "Watching" && <span>Watching places no bid and tells no one.</span>}</div>}
      <div className={`participant-items ${view === "large" ? "is-large" : "is-compact"}`}>
      {items.map(item => {
        const s = status(item), mine = item.leader?.isMe || item.award?.isMe;
        return (
          <article key={item.id} className={`participant-item${mine ? " is-mine" : ""}${item.withdrawn ? " is-withdrawn" : ""}`}>
            <button className="participant-item-open" onClick={() => onOpen(item.id)} aria-label={`Open item ${item.position + 1}: ${item.title}`}>
              <span className="participant-item-photo">{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="participant-photo-placeholder"><span>{String(item.position + 1).padStart(2, "0")}</span><small>{item.category || "Event item"}</small></span>}<span className="participant-number"><small>Item</small>{String(item.position + 1).padStart(2, "0")}</span>{item.donor && <span className="participant-provider">Provided by <b>{item.donor}</b></span>}</span>
              <span className="participant-item-info"><span className="participant-eyebrow">{item.category || "Featured item"}</span><b className="participant-item-title">{item.title}</b>{item.short && <span className="participant-item-short">{item.short}</span>}<span className="participant-item-price"><b>{formatMoney(item.currentMinor ?? item.openingMinor)}</b><small>{item.bidCount === 0 ? "Opening bid" : `${item.bidCount} ${item.bidCount === 1 ? "bid" : "bids"}`}</small></span><span className="participant-item-state">{s && <span className={`participant-status tone-${s.tone}`}>{s.label}</span>}{item.withdrawn ? <span className="participant-withdrawn-label">Withdrawn</span> : item.phase === "open" ? <small>Ends in {untilText(item.closesAt, serverNow)}</small> : null}</span></span>
            </button>
            {onWatch && !item.withdrawn && <button className={`participant-watch${item.watching ? " is-on" : ""}`} type="button" aria-pressed={item.watching} aria-label={`${item.watching ? "Stop watching" : "Watch"} item ${item.position + 1}: ${item.title}`} onClick={() => onWatch(item, !item.watching)}><BookmarkIcon filled={item.watching} /></button>}
          </article>
        );
      })}
      </div>
    </>
  );
}

function MyBids({ snap, serverNow, onOpen, onBid }: { snap: Snapshot; serverNow: number; onOpen: (id: string) => void; onBid: (item: Item) => void }) {
  const mine = snap.items.filter(i => i.myBidCount > 0 || i.award?.isMe || i.bidHistory?.some(b => b.isMe));
  const groups = [
    { key: "outbid", title: "Outbid", items: mine.filter(i => i.phase === "open" && i.myBidCount > 0 && !i.leader?.isMe) },
    { key: "leading", title: "Leading", items: mine.filter(i => i.phase === "open" && i.leader?.isMe) },
    { key: "won", title: "Won", items: mine.filter(i => i.award?.isMe) },
    { key: "closed", title: "Closed", items: mine.filter(i => i.phase === "closed" && !i.award?.isMe) },
    { key: "voided", title: "Voided bids", items: mine.filter(i => i.phase === "open" && i.myBidCount === 0 && !i.award?.isMe && i.bidHistory?.some(b => b.isMe) && i.bidHistory.filter(b => b.isMe).every(b => b.voided)) },
  ];
  return (
    <section className="participant-bids">
      <div className="participant-pagehead"><p className="participant-eyebrow">Your auction activity</p><h1>My bids</h1><p>{mine.length ? `${mine.length} ${mine.length === 1 ? "item" : "items"} you've bid on` : "Your bids and results will be here."}</p></div>
      {snap.items.some(i => i.award?.isMe) && <WonBanner snap={snap} />}
      {!mine.length && <div className="participant-empty"><b>You haven't placed a bid yet.</b><span>When you bid, your standing and bid history will be easy to find here.</span></div>}
      {groups.map(group => group.items.length > 0 && <section className="participant-bid-group" key={group.key}><div className="participant-group-head"><h2>{group.title}</h2><span>{group.items.length}</span></div><div className="participant-tickets">{group.items.map(item => <BidTicket key={item.id} item={item} serverNow={serverNow} onOpen={onOpen} onBid={onBid} />)}</div></section>)}
      {snap.me!.pledges.length > 0 && (
        <div className="participant-donations">
          <h2>Your donations</h2>
          {snap.me!.pledges.map(p => <div key={p.id} className="row between"><span>{p.recipientName}</span><span className="money">{formatMoney(p.amountMinor)}</span></div>)}
        </div>
      )}
    </section>
  );
}

function BidTicket({ item, serverNow, onOpen, onBid }: { item: Item; serverNow: number; onOpen: (id: string) => void; onBid: (item: Item) => void }) {
  const st = status(item), activeMine = item.bidHistory?.filter(b => b.isMe && !b.voided) ?? [], amount = item.myHighestMinor ?? (activeMine.length ? Math.max(...activeMine.map(b => b.amountMinor)) : null);
  return <article className={`participant-ticket edge-${item.award?.isMe ? "won" : item.phase === "closed" || st?.tone === "closed" ? "closed" : item.leader?.isMe ? "leading" : "outbid"}`}>
    <button className="participant-ticket-main" onClick={() => onOpen(item.id)}><span className="participant-ticket-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span>{String(item.position + 1).padStart(2, "0")}</span>}</span><span className="participant-ticket-copy"><small>Item {String(item.position + 1).padStart(2, "0")}</small><b>{item.title}</b>{st && <span className={`participant-status tone-${st.tone}`}>{st.label}</span>}<span>{item.phase === "open" ? `Ends in ${untilText(item.closesAt, serverNow)}` : item.phase === "closed" ? "Bidding has closed" : "Scheduled"}</span></span></button>
    <div className="participant-ticket-stub"><small>{amount === null ? "Your standing" : "Your highest bid"}</small><b>{amount === null ? "—" : formatMoney(amount)}</b>{item.currentMinor !== null && amount !== null && !item.leader?.isMe && <span>Now {formatMoney(item.currentMinor)}</span>}</div>
    <div className="participant-ticket-actions"><button className="participant-link-button" onClick={() => onOpen(item.id)}>View item and bid history <span aria-hidden="true">→</span></button>{item.phase === "open" && !item.withdrawn && !item.leader?.isMe && <button className="btn primary" onClick={() => onBid(item)}>Bid again</button>}</div>
    <details className="participant-history-fold"><summary>Bid history <span>{item.bidHistory?.length ?? item.myBidCount} {item.bidHistory?.length === 1 || (!item.bidHistory?.length && item.myBidCount === 1) ? "bid" : "bids"}</span></summary><BidHistory item={item} /></details>
  </article>;
}

function BidHistory({ item }: { item: Item }) {
  const history = item.bidHistory ?? [];
  if (!history.length) return <p className="participant-history-empty">Your bid history will appear here as the event updates.</p>;
  return <ol className="participant-history">{history.map((bid, index) => <li key={bid.id} className={`${bid.isMe ? "mine" : ""}${bid.voided ? " is-voided" : ""}`}><span className="participant-history-who"><b>{bid.isMe ? "Your bid" : "Another bidder"}</b><small>{fmtTime(bid.decidedAt)}</small></span><span className="participant-history-amount"><b>{formatMoney(bid.amountMinor)}</b>{bid.voided ? <small>Voided</small> : index === 0 && <small>Current high bid</small>}</span></li>)}</ol>;
}

function WonBanner({ snap }: { snap: Snapshot }) {
  const won = snap.items.filter(i => i.award?.isMe);
  return (
    <div className="won-banner stack" style={{ gap: 6 }}>
      <h2>You won {won.length === 1 ? won[0].title : `${won.length} items`}!</h2>
      {snap.me!.winnerInstructions && <p style={{ whiteSpace: "pre-wrap" }}>{snap.me!.winnerInstructions}</p>}
    </div>
  );
}

function Sponsors({ snap }: { snap: Snapshot }) {
  if (!snap.event.sponsors.length) return null;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span className="small faint">Thanks to our sponsors</span>
      <div className="sponsors">{snap.event.sponsors.map(s => <span className="sp" key={s.name}>{s.logoUrl && <img src={s.logoUrl} alt="" />}{s.name}</span>)}</div>
    </div>
  );
}

function EventInfo({ snap }: { snap: Snapshot }) {
  const e = snap.event;
  return (
    <section className="participant-event">
      <div className="participant-event-hero">{e.coverUrl ? <img src={e.coverUrl} alt="" /> : <div className="participant-event-placeholder"><span>BidZizi</span><small>A good find is worth sharing.</small></div>}<span className="participant-event-kicker">The event</span></div>
      <div className="participant-event-body"><p className="participant-eyebrow">{e.phase === "open" ? "Now welcoming bids" : e.phase === "upcoming" ? "Save the date" : "Thank you for joining us"}</p><h1>{e.name}</h1>
        <div className="participant-event-facts"><div><small>When</small><b>{fmtTime(e.startsAt, e.timezone)} – {fmtTime(e.endsAt, e.timezone)}</b></div>{e.venue && <div><small>Where</small><b>{e.venue}</b></div>}</div>
        {e.welcome && <section className="participant-event-welcome"><p className="participant-eyebrow">A welcome from the host</p><p>{e.welcome}</p></section>}
        <Sponsors snap={snap} />
        {e.donations.enabled && <section className="participant-event-section"><p className="participant-eyebrow">Give back</p><h2>Support a community partner</h2><p>{e.donations.open ? "Optional donations are available from the Donate tab." : "Donations have closed for this event."}</p>{e.donations.recipients.map(r => <div className="participant-recipient" key={r.id}>{r.logoUrl ? <img src={r.logoUrl} alt="" /> : <span>{initials(r.name)}</span>}<div><b>{r.name}</b>{r.description && <small>{r.description}</small>}</div></div>)}</section>}
        <section className="participant-event-section"><p className="participant-eyebrow">How winning works</p><h2>Good luck with your bids.</h2><ol className="participant-winning-steps"><li><span>01</span><p>Place a bid while the item is open. Your bid is confirmed only after it is recorded.</p></li><li><span>02</span><p>Follow your standing in My bids. We'll show you if another bid moves ahead.</p></li><li><span>03</span><p>After bidding closes, event staff confirm winners and share next steps.</p></li></ol></section>
        <p className="participant-identity-note">You're here as <b>{snap.me!.displayName}</b> · {snap.me!.businessName}. Lost your phone? Event staff can help you rejoin.</p>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- item page

function ItemPage({ item, snap, serverNow, onBack, onBid, onWatch }: { item: Item; snap: Snapshot; serverNow: number; onBack: () => void; onBid: () => void; onWatch: (on: boolean) => void }) {
  const s = status(item);
  const canBid = item.phase === "open" && !item.withdrawn && !item.leader?.isMe && item.minimumNextMinor !== null && snap.me!.canBid;
  return (
    <>
      <div className="participant-detail-topbar">
        <button onClick={onBack}><span aria-hidden="true">←</span> Back to items</button>
        <b>BidZizi</b>
        <button className={`participant-watch-inline${item.watching ? " is-on" : ""}`} aria-pressed={item.watching} onClick={() => onWatch(!item.watching)}><BookmarkIcon filled={item.watching} /><span>{item.watching ? "Watching" : "Watch"}</span></button>
      </div>
      <section className="participant-detail">
        <div className="participant-detail-photo">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <div className="participant-photo-placeholder"><span>{String(item.position + 1).padStart(2, "0")}</span><small>{item.category || "Event item"}</small></div>}<span className="participant-number"><small>Item</small>{String(item.position + 1).padStart(2, "0")}</span></div>
        <div className="participant-detail-body">
          <div className="participant-provider-line"><span className="participant-provider-mark">{initials(item.donor || "Item")}</span><span><small>Provided by</small><b>{item.donor || "Event host"}</b></span><span className="participant-eyebrow">{item.category || "Featured item"}</span></div>
          <h1>{item.title}</h1>
          {item.short && <p className="participant-detail-short">{item.short}</p>}
          <section className="participant-standing-card" aria-label="Bid standing">
            <div className="participant-standing-main"><span className="participant-eyebrow">{item.bidCount === 0 ? "Opening bid" : "Current bid"}</span><b>{formatMoney(item.currentMinor ?? item.openingMinor)}</b>{item.leader && <small>{item.leader.isMe ? "You're the highest bidder" : "Highest bid"} · {item.bidCount} {item.bidCount === 1 ? "bid" : "bids"}</small>}</div>
            <div className="participant-standing-side"><span className="participant-eyebrow">{item.phase === "closed" ? "Closed" : item.phase === "scheduled" ? "Opens" : "Time left"}</span><b>{item.phase === "closed" ? fmtTime(item.closesAt, snap.event.timezone) : item.phase === "scheduled" ? fmtTime(item.opensAt, snap.event.timezone) : untilText(item.closesAt, serverNow)}</b><small>{item.phase === "open" ? `Closes ${fmtClock(item.closesAt, snap.event.timezone)}` : item.phase === "scheduled" ? "Bidding has not opened" : `${item.bidCount} total bids`}</small></div>
          </section>
          {s && <p className={`participant-detail-status tone-${s.tone}`} role="status">{s.label}{item.phase === "open" && item.leader?.isMe ? " · Your bid is recorded" : ""}</p>}
          {item.withdrawn && <div className="participant-withdrawal-notice"><b>This item has been withdrawn.</b><p>{item.withdrawalMessage || "The event host has withdrawn this item. No further bids can be placed."}</p></div>}
          {item.award?.isMe && snap.me!.winnerInstructions && <p className="notice ok" style={{ whiteSpace: "pre-wrap" }}>{snap.me!.winnerInstructions}</p>}
          {item.award && !item.award.isMe && item.award.winner && <p className="small muted">This item was awarded to a participant.</p>}
          {item.description && <section className="participant-prose"><p className="participant-eyebrow">About this item</p><p>{item.description}</p></section>}
          {!snap.me!.canBid && item.phase === "open" && !item.withdrawn && <p className="notice warn">Your bidding is paused. Talk to the event staff.</p>}
          <section className="participant-prose participant-detail-history"><p className="participant-eyebrow">The bidding</p><h2>Bid history</h2><BidHistory item={item} /></section>
          <button className="participant-event-link" onClick={onBack}>Back to all items <span aria-hidden="true">→</span></button>
        </div>
      </section>
      {item.phase === "open" && !item.withdrawn && (
        <div className="participant-actionbar">
          <div>
            {item.leader?.isMe ? <b>You're the highest bidder</b> : <><span className="small faint">Next bid at least</span><div className="money">{item.minimumNextMinor === null ? "—" : formatMoney(item.minimumNextMinor)}</div></>}
          </div>
          <button className="btn primary" disabled={!canBid} onClick={onBid}>Bid</button>
        </div>
      )}
    </>
  );
}

function TabIcon({ name }: { name: Tab }) {
  const paths: Record<Tab, React.ReactNode> = {
    items: <><path d="M4 5h7v7H4zM14 5h6v7h-6zM4 15h7v5H4zM14 15h6v5h-6z" /></>,
    watching: <path d="M6 3.8c-1.7 0-3 1.4-3 3.1 0 4.4 9 12.2 9 12.2s9-7.8 9-12.2c0-1.7-1.3-3.1-3-3.1-2.5 0-4.5 2.4-6 4.2-1.5-1.8-3.5-4.2-6-4.2Z" />,
    mine: <><path d="M4 4h16v16H4z" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
    event: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7h.01" /></>,
    give: <><path d="M12 20s-8-4.7-8-10.3A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 2.7C20 15.3 12 20 12 20Z" /><path d="M12 8v7M9.5 11.5h5" /></>,
  };
  return <svg className="participant-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
function BookmarkIcon({ filled = false }: { filled?: boolean }) { return <svg className="participant-icon" viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4.8c0-.9.7-1.6 1.6-1.6h8.8c.9 0 1.6.7 1.6 1.6V21l-6-4-6 4V4.8Z" /></svg>; }
function SearchIcon() { return <svg className="participant-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>; }
function GridIcon() { return <svg className="participant-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>; }
function ListIcon() { return <svg className="participant-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>; }

// ---------------------------------------------------------------- bidding

function BidSheet({ item, me, code, pendingKey, onClose, onResult }: { item: Item; me: NonNullable<Snapshot["me"]>; code: string; pendingKey: string; onClose: () => void; onResult: (text: string) => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const minimum = item.minimumNextMinor ?? 0;
  const [amount, setAmount] = useState(minimum), [text, setText] = useState(dollarsInput(minimum));
  const [state, setState] = useState<"edit" | "sending" | "unconfirmed" | "rejected">("edit");
  const [message, setMessage] = useState("");
  useEffect(() => { if (state === "sending") dialog.current?.focus(); }, [state]);
  const request = useRef<PendingBid | null>(null);
  const picks = [minimum, minimum + item.incrementMinor, minimum + item.incrementMinor * 2];
  const set = (minor: number) => { setAmount(minor); setText(dollarsInput(minor)); };
  const valid = amount >= minimum && amount > 0;

  async function submit(retry = false) {
    if (!retry) {
      request.current = { requestId: newId(), itemId: item.id, amountMinor: amount };
      localStorage.setItem(pendingKey, JSON.stringify(request.current));
    }
    const pending = request.current!;
    setState("sending"); setMessage("");
    try {
      const r = await api<{ receipt: Receipt }>("POST", `/api/v1/e/${code}/bid`, pending);
      if (r.data?.receipt) {
        localStorage.removeItem(pendingKey);
        if (r.data.receipt.accepted) { onResult(`Bid placed: ${formatMoney(pending.amountMinor)} — you're leading`); onClose(); return; }
        setState("rejected"); setMessage(REASONS[r.data.receipt.reason ?? ""] ?? "Your bid wasn't placed.");
        if (r.data.receipt.minimumNextMinor) set(r.data.receipt.minimumNextMinor);
        return;
      }
      if (r.status >= 500) { setState("unconfirmed"); return; }
      localStorage.removeItem(pendingKey);
      setState("rejected"); setMessage(errorText(r));
    } catch { setState("unconfirmed"); }
  }

  return (
    <div className="sheet-backdrop" onClick={e => { if (e.target === e.currentTarget && state !== "sending") onClose(); }}>
      <div ref={dialog} className="sheet" role="dialog" aria-modal="true" aria-labelledby="bid-title" tabIndex={-1} onKeyDown={e => {
        if (e.key === "Escape" && state !== "sending") { e.preventDefault(); onClose(); }
        if (e.key !== "Tab") return;
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), [tabindex='0']") ?? [])].filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (!first) { e.preventDefault(); dialog.current?.focus(); }
        else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }}>
        <div className="row between"><h2 id="bid-title">Place a bid</h2>{state !== "sending" && <button className="btn ghost" onClick={onClose}>Close</button>}</div>
        <div className="row" style={{ gap: 10 }}>
          <span className="pass" style={{ position: "static", borderRadius: 12, padding: "8px 12px", flex: 1 }}>
            <span className="mono" style={{ width: 32, height: 32, fontSize: 13 }}>{initials(me.businessName)}</span>
            <span className="who"><b>{me.businessName}</b><span>{me.displayName}</span></span>
          </span>
        </div>
        <p><b>{item.title}</b> · current {formatMoney(item.currentMinor ?? item.openingMinor)}</p>

        {state === "unconfirmed" ? (
          <div className="stack">
            <p className="notice warn">We couldn't confirm your {formatMoney(request.current!.amountMinor)} bid. It may or may not have gone through.</p>
            <button className="btn primary block" onClick={async () => {
              try {
                const r = await api<{ receipt: Receipt | null }>("GET", `/api/v1/e/${code}/receipt/${request.current!.requestId}`);
                if (!r.ok) return;
                if (r.data.receipt?.accepted) { localStorage.removeItem(pendingKey); onResult(`Confirmed: your ${formatMoney(request.current!.amountMinor)} bid went through`); onClose(); }
                else if (r.data.receipt) { localStorage.removeItem(pendingKey); setState("rejected"); setMessage(REASONS[r.data.receipt.reason ?? ""] ?? "Your bid wasn't placed."); }
                else submit(true); // Never recorded: safe to resend the same request.
              } catch { /* still offline */ }
            }}>Check status</button>
          </div>
        ) : (
          <>
            <div className="stepper">
              <button aria-label="Lower" disabled={amount - item.incrementMinor < minimum || state === "sending"} onClick={() => set(amount - item.incrementMinor)}>−</button>
              <input inputMode="decimal" aria-label="Bid amount in dollars" value={`$${text}`} disabled={state === "sending"}
                onChange={e => { const raw = e.target.value.replace(/^\$/, ""); setText(raw); const v = parseDollars(raw); setAmount(v ?? 0); }} />
              <button aria-label="Raise" disabled={state === "sending"} onClick={() => set(Math.max(amount, minimum) + item.incrementMinor)}>+</button>
            </div>
            <div className="picks">{picks.map(p => <button key={p} aria-pressed={amount === p} onClick={() => set(p)} disabled={state === "sending"}>{formatMoney(p)}</button>)}</div>
            <ul className="explain">
              <li>Bids <b className="money">{valid ? formatMoney(amount) : "—"}</b> for {me.businessName}</li>
              <li>Minimum right now is <span className="money">{formatMoney(minimum)}</span></li>
              <li>You lead only once the bid is confirmed</li>
            </ul>
            {!valid && text && <p className="notice error">Enter at least {formatMoney(minimum)}.</p>}
            {state === "rejected" && <p className="notice error" role="alert">{message}</p>}
            <button className="btn primary block" style={{ minHeight: 52 }} disabled={!valid || state === "sending"} onClick={() => submit()}>
              {state === "sending" ? "Sending…" : `Bid ${valid ? formatMoney(amount) : ""}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** After a reload, resolves a bid whose response never arrived. */
function ResumePending({ code, pendingKey, onResolved }: { code: string; pendingKey: string; onResolved: (text: string) => void }) {
  const report = useRef(onResolved);
  report.current = onResolved;
  // Runs once per page load, so it never races a bid being sent from this page.
  useEffect(() => {
    const raw = localStorage.getItem(pendingKey);
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingBid;
    api<{ receipt: Receipt | null }>("GET", `/api/v1/e/${code}/receipt/${pending.requestId}`).then(r => {
      if (!r.ok) return;
      localStorage.removeItem(pendingKey);
      if (r.data.receipt?.accepted) report.current(`Your ${formatMoney(pending.amountMinor)} bid went through`);
      else if (r.data.receipt) report.current("Your last bid wasn't placed");
      else report.current("Your last bid didn't reach us — nothing was placed");
    }).catch(() => {});
  }, [code, pendingKey]);
  return null;
}

// ---------------------------------------------------------------- donations

function Give({ snap, code, onDone }: { snap: Snapshot; code: string; onDone: (text: string) => void }) {
  const d = snap.event.donations;
  const [recipient, setRecipient] = useState(d.recipients.length === 1 ? d.recipients[0].id : "");
  const [amount, setAmount] = useState<number | null>(null), [custom, setCustom] = useState("");
  const [step, setStep] = useState<"pick" | "review" | "sending">("pick"), [error, setError] = useState("");
  const request = useRef<string | null>(null);
  const chosen = d.recipients.find(r => r.id === recipient);
  const value = amount ?? parseDollars(custom);
  const valid = Boolean(chosen && value && value >= 100 && value <= d.capMinor);

  async function confirm() {
    request.current ??= newId();
    setStep("sending"); setError("");
    try {
      const r = await api("POST", `/api/v1/e/${code}/pledge`, { requestId: request.current, recipientId: recipient, amountMinor: value });
      if (r.ok) { request.current = null; setStep("pick"); setAmount(null); setCustom(""); onDone(`Donation recorded: ${formatMoney(value!)} to ${chosen!.name}`); return; }
      if (r.status >= 500) { setStep("review"); setError("We couldn't confirm. Tap Confirm again — it won't be recorded twice."); return; }
      request.current = null; setStep("review"); setError(errorText(r));
    } catch { setStep("review"); setError("Connection lost. Tap Confirm again — it won't be recorded twice."); }
  }

  if (!d.open) return <><h1>Donate</h1><p className="muted">Donations are closed.</p></>;
  if (step !== "pick") return (
    <>
      <h1>Confirm donation</h1>
      <div className="stub stack" style={{ gap: 6 }}>
        <span className="small faint">To</span><b>{chosen?.name}</b>
        <span className="small faint">Amount</span><span className="money big">{formatMoney(value!)}</span>
        <span className="small faint">From</span><span>{snap.me!.businessName}</span>
      </div>
      <p className="small muted">Event staff will process your donation after the event.</p>
      {error && <p className="notice error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={step === "sending"} onClick={confirm}>{step === "sending" ? "Recording…" : "Confirm donation"}</button>
      <button className="btn ghost" disabled={step === "sending"} onClick={() => { request.current = null; setStep("pick"); setError(""); }}>Back</button>
    </>
  );
  return (
    <>
      <h1>Donate</h1>
      <p className="muted">Give to a nonprofit at this event.</p>
      <div className="stack" role="radiogroup" aria-label="Nonprofit">
        {d.recipients.map(r => (
          <button key={r.id} role="radio" aria-checked={recipient === r.id} onClick={() => setRecipient(r.id)}
            className="lot" style={{ gridTemplateColumns: r.logoUrl ? "48px 1fr" : "1fr", borderColor: recipient === r.id ? "var(--cobalt)" : undefined, boxShadow: recipient === r.id ? "0 0 0 2px var(--cobalt-bg)" : undefined }}>
            {r.logoUrl && <span className="thumb" style={{ width: 48, height: 48 }}><img src={r.logoUrl} alt="" /></span>}
            <span className="stack" style={{ gap: 2 }}><b>{r.name}</b>{r.description && <span className="small muted">{r.description}</span>}</span>
          </button>
        ))}
      </div>
      <div className="picks">
        {[2500, 5000, 10000].map(v => <button key={v} aria-pressed={amount === v} onClick={() => { setAmount(v); setCustom(""); }}>{formatMoney(v)}</button>)}
      </div>
      <label className="field"><span>Or another amount</span>
        <input className="input" inputMode="decimal" placeholder="$" value={custom} onChange={e => { setCustom(e.target.value); setAmount(null); }} /></label>
      {value !== null && value > d.capMinor && <p className="notice error">The most you can give at once is {formatMoney(d.capMinor)}.</p>}
      <button className="btn primary block" disabled={!valid} onClick={() => setStep("review")}>Review</button>
    </>
  );
}
