"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dollarsInput, errorText, fmtClock, fmtTime, initials, newId, Offline, parseDollars, untilText } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";

type Item = {
  id: string; position: number; title: string; short: string; description: string; category: string; donor: string; imageUrl: string | null;
  openingMinor: number; opensAt: string; closesAt: string; phase: "scheduled" | "open" | "closed";
  currentMinor: number | null; bidCount: number; leader: { name: string; business: string; isMe: boolean } | null;
  minimumNextMinor: number | null; incrementMinor: number; watching: boolean; myHighestMinor: number | null; myBidCount: number;
  award: { status: string; winner: { name: string; business: string } | null; amountMinor: number | null; isMe: boolean } | null;
};
type Snapshot = {
  serverNow: string;
  event: { id: string; code: string; name: string; welcome: string; venue: string; timezone: string; coverUrl: string | null; startsAt: string; endsAt: string;
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
    <main className="phone"><div className="screen" style={{ justifyContent: "center", textAlign: "center" }}>
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
    <main className="phone">
      <header className="pass">
        <span className="mono" aria-hidden="true">{initials(me.businessName)}</span>
        <div className="who"><b>{me.businessName}</b><span>{me.displayName}</span></div>
        <span className="event">{snap.event.name}</span>
      </header>
      {offline && <p className="notice warn offline" role="status">Connection lost — showing standings as of {fmtClock(new Date(serverNow - 4000))}. Reconnecting…</p>}

      {current ? (
        <ItemPage item={current} snap={snap} serverNow={serverNow} onBack={closeLayer} onBid={() => openSheet(current)}
          onWatch={async on => { await api("POST", `/api/v1/e/${code}/watch`, { itemId: current.id, on }).catch(() => {}); load(); }} />
      ) : (
        <div className="screen">
          {tab === "items" && <Catalog snap={snap} serverNow={serverNow} onOpen={openItem} />}
          {tab === "watching" && <ItemList title="Watching" empty="Tap the bookmark on any item to keep it here." items={snap.items.filter(i => i.watching)} serverNow={serverNow} onOpen={openItem} />}
          {tab === "mine" && <MyBids snap={snap} serverNow={serverNow} onOpen={openItem} />}
          {tab === "event" && <EventInfo snap={snap} />}
          {tab === "give" && <Give snap={snap} code={code} onDone={(text) => { flash(text); load(); }} />}
        </div>
      )}

      {!current && (
        <nav className="tabs" aria-label="Sections">
          {(["items", "watching", "mine", ...(snap.event.donations.enabled ? ["give"] : []), "event"] as Tab[]).map(t => (
            <button key={t} aria-current={tab === t ? "page" : undefined} onClick={() => { setTab(t); window.scrollTo(0, 0); }}>
              {{ items: "Items", watching: "Watching", mine: "My bids", event: "Event", give: "Donate" }[t]}
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
    <main className="phone">
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

// ---------------------------------------------------------------- lists

function Catalog({ snap, serverNow, onOpen }: { snap: Snapshot; serverNow: number; onOpen: (id: string) => void }) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const categories = useMemo(() => [...new Set(snap.items.map(i => i.category).filter(Boolean))], [snap.items]);
  const q = query.trim().toLowerCase();
  const shown = snap.items.filter(i => (!category || i.category === category) && (!q || `${i.title} ${i.short} ${i.donor}`.toLowerCase().includes(q)));
  const e = snap.event;
  return (
    <>
      <div className="stack" style={{ gap: 4 }}>
        <h1>{e.name}</h1>
        <p className="small muted">{e.phase === "open" ? `Bidding ends ${fmtTime(e.endsAt, e.timezone)}` : e.phase === "upcoming" ? `Bidding opens ${fmtTime(e.startsAt, e.timezone)}` : "Bidding has ended"}</p>
      </div>
      {snap.items.some(i => i.award?.isMe) && <WonBanner snap={snap} />}
      {snap.items.length > 4 && <input className="input" type="search" placeholder="Search items" value={query} onChange={x => setQuery(x.target.value)} aria-label="Search items" />}
      {categories.length > 1 && (
        <div className="picks" role="group" aria-label="Category">
          <button aria-pressed={!category} onClick={() => setCategory("")}>All</button>
          {categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}
        </div>
      )}
      <ItemList items={shown} serverNow={serverNow} onOpen={onOpen} empty={snap.items.length ? "No items match." : "Items will appear here soon."} />
    </>
  );
}

function ItemList({ items, serverNow, onOpen, empty, title }: { items: Item[]; serverNow: number; onOpen: (id: string) => void; empty: string; title?: string }) {
  return (
    <>
      {title && <h1>{title}</h1>}
      {!items.length && <p className="muted">{empty}</p>}
      {items.map(item => {
        const s = status(item), mine = item.leader?.isMe || item.award?.isMe;
        return (
          <button key={item.id} className={`lot${mine ? " mine" : ""}`} onClick={() => onOpen(item.id)}>
            <span className="thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <span className="num">{String(item.position + 1).padStart(2, "0")}</span>}</span>
            <span className="stack" style={{ gap: 4, minWidth: 0 }}>
              <h3>{item.title}</h3>
              <span className="price">
                <span className="money">{formatMoney(item.currentMinor ?? item.openingMinor)}</span>
                <span className="small faint">{item.currentMinor === null ? "starting" : `${item.bidCount} bid${item.bidCount === 1 ? "" : "s"}`}</span>
              </span>
              <span className="row wrap" style={{ gap: 6 }}>
                {s && <span className={`chip ${s.tone}`}>{s.label}</span>}
                {item.phase === "open" && <span className="small faint">Ends in {untilText(item.closesAt, serverNow)}</span>}
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}

function MyBids({ snap, serverNow, onOpen }: { snap: Snapshot; serverNow: number; onOpen: (id: string) => void }) {
  const mine = snap.items.filter(i => i.myBidCount > 0 || i.award?.isMe);
  return (
    <>
      <h1>My bids</h1>
      {snap.items.some(i => i.award?.isMe) && <WonBanner snap={snap} />}
      <ItemList items={mine} serverNow={serverNow} onOpen={onOpen} empty="Items you bid on will show up here." />
      {snap.me!.pledges.length > 0 && (
        <div className="card pad stack">
          <h3>Your donations</h3>
          {snap.me!.pledges.map(p => <div key={p.id} className="row between"><span>{p.recipientName}</span><span className="money">{formatMoney(p.amountMinor)}</span></div>)}
        </div>
      )}
    </>
  );
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
    <>
      {e.coverUrl && <div className="cover"><img src={e.coverUrl} alt="" /></div>}
      <h1>{e.name}</h1>
      <div className="card pad stack">
        <div><span className="small faint">When</span><p>{fmtTime(e.startsAt, e.timezone)} – {fmtTime(e.endsAt, e.timezone)}</p></div>
        {e.venue && <div><span className="small faint">Where</span><p>{e.venue}</p></div>}
      </div>
      {e.welcome && <p style={{ whiteSpace: "pre-wrap" }}>{e.welcome}</p>}
      <Sponsors snap={snap} />
      <p className="small faint">You joined as {snap.me!.displayName} · {snap.me!.businessName}. Lost your phone? Staff can move you to a new one.</p>
    </>
  );
}

// ---------------------------------------------------------------- item page

function ItemPage({ item, snap, serverNow, onBack, onBid, onWatch }: { item: Item; snap: Snapshot; serverNow: number; onBack: () => void; onBid: () => void; onWatch: (on: boolean) => void }) {
  const s = status(item);
  const canBid = item.phase === "open" && !item.leader?.isMe && item.minimumNextMinor !== null && snap.me!.canBid;
  return (
    <>
      <div className="topbar">
        <button className="btn ghost" onClick={onBack}>← Items</button>
        <span className="grow" />
        <button className="btn small" aria-pressed={item.watching} onClick={() => onWatch(!item.watching)}>{item.watching ? "★ Watching" : "☆ Watch"}</button>
      </div>
      <div className="screen" style={{ paddingBottom: 24 }}>
        {item.imageUrl && <div className="detail-img"><img src={item.imageUrl} alt="" /></div>}
        <div className="stack" style={{ gap: 6 }}>
          <span className="small faint">{String(item.position + 1).padStart(2, "0")}{item.category ? ` · ${item.category}` : ""}</span>
          <h1>{item.title}</h1>
          {item.donor && <p className="small muted">Provided by {item.donor}</p>}
        </div>
        <div className="stub stack" style={{ gap: 8 }}>
          <div className="row between">
            <span className="small faint">{item.currentMinor === null ? "Starting bid" : "Current bid"}</span>
            {s && <span className={`chip ${s.tone}`}>{s.label}</span>}
          </div>
          <span className="money big">{formatMoney(item.currentMinor ?? item.openingMinor)}</span>
          {item.leader && <p className="small muted">{item.leader.isMe ? "You" : `${item.leader.name} · ${item.leader.business}`} · {item.bidCount} bid{item.bidCount === 1 ? "" : "s"}</p>}
          {item.phase === "open" && <p className="small">Ends {fmtClock(item.closesAt, snap.event.timezone)} · in {untilText(item.closesAt, serverNow)}</p>}
          {item.phase === "scheduled" && <p className="small">Opens {fmtTime(item.opensAt, snap.event.timezone)}</p>}
          {item.award?.isMe && snap.me!.winnerInstructions && <p className="notice ok" style={{ whiteSpace: "pre-wrap" }}>{snap.me!.winnerInstructions}</p>}
          {item.award && !item.award.isMe && item.award.winner && <p className="small muted">Won by {item.award.winner.name} · {item.award.winner.business}</p>}
        </div>
        {item.short && <p style={{ fontWeight: 600 }}>{item.short}</p>}
        {item.description && <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{item.description}</p>}
        {!snap.me!.canBid && item.phase === "open" && <p className="notice warn">Your bidding is paused. Talk to the event staff.</p>}
      </div>
      {item.phase === "open" && (
        <div className="actionbar">
          <div className="grow">
            {item.leader?.isMe ? <b>You're the highest bidder</b> : <><span className="small faint">Next bid at least</span><div className="money">{item.minimumNextMinor === null ? "—" : formatMoney(item.minimumNextMinor)}</div></>}
          </div>
          <button className="btn primary" disabled={!canBid} onClick={onBid}>Bid</button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- bidding

function BidSheet({ item, me, code, pendingKey, onClose, onResult }: { item: Item; me: NonNullable<Snapshot["me"]>; code: string; pendingKey: string; onClose: () => void; onResult: (text: string) => void }) {
  const minimum = item.minimumNextMinor ?? 0;
  const [amount, setAmount] = useState(minimum), [text, setText] = useState(dollarsInput(minimum));
  const [state, setState] = useState<"edit" | "sending" | "unconfirmed" | "rejected">("edit");
  const [message, setMessage] = useState("");
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
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="bid-title">
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
