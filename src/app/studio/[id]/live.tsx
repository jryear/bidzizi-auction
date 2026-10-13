"use client";
// Live: a control room for the host's laptop, and a one-click stage display for the projector.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorText, fmtClock } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { IAlert, IArrowUp, IClock, IMonitor, ISearch, IUsers, IMore, IExternal } from "../../../lib/icons";
import { countdown } from "../../e/[code]/model";
import { Amount, ItemArt } from "../../e/[code]/ui";
import type { Data, Item, Participant } from "../data";
import { Menu, Status } from "../kit";

type Ctx = { data: Data; reload: () => Promise<void>; flash: (t: string, tone?: "ink" | "red" | "green") => void; patchEvent: (f: Record<string, unknown>) => Promise<boolean> };

export function LiveBoard({ ctx }: { ctx: Ctx }) {
  const { data } = ctx, e = data.event;
  const now = useTicking(data.serverNow);
  const [focus, setFocus] = useState<string | null>(null);
  const titles = useMemo(() => new Map(data.items.map(i => [i.id, i.title])), [data.items]);
  const live = data.items.filter(i => i.ready);
  const raised = live.reduce((s, i) => s + (i.currentMinor ?? 0), 0);
  const bids = live.reduce((s, i) => s + i.bidCount, 0);
  const t = (s: string) => new Date(s).getTime();
  const soon = live.filter(i => i.phase === "open" && t(i.effectiveClosesAt) - now < 15 * 60_000).sort((a, b) => t(a.effectiveClosesAt) - t(b.effectiveClosesAt));
  const quiet = live.filter(i => i.phase === "open" && !i.bidCount);
  const order = [...live].sort((a, b) => (a.phase === "open" ? 0 : a.phase === "scheduled" ? 1 : 2) - (b.phase === "open" ? 0 : b.phase === "scheduled" ? 1 : 2) || t(a.effectiveClosesAt) - t(b.effectiveClosesAt) || a.position - b.position);
  const focused = data.items.find(i => i.id === focus);
  const clock = e.phase === "open" ? { label: "Bidding ends in", value: countdown(e.endsAt, now), hot: t(e.endsAt) - now < 10 * 60_000 }
    : e.phase === "upcoming" || e.status === "draft" ? { label: e.status === "draft" ? "Draft. Not live yet" : "Bidding opens in", value: e.status === "draft" ? "—" : countdown(e.startsAt, now), hot: false }
    : { label: "Bidding has ended", value: "Done", hot: false };

  return (
    <div className="live">
      <div className="live-stats">
        <div className={`ls big${clock.hot ? " hot" : ""}`}><span><IClock size={16} />{clock.label}</span><b>{clock.value}</b></div>
        <div className="ls"><span>Raised so far</span><Amount minor={raised} className="ls-amt" /></div>
        <div className="ls"><span><IUsers size={16} />Joined</span><b>{data.participants.length}</b></div>
        <div className="ls"><span><IArrowUp size={16} />Bids</span><b>{bids}</b></div>
        <div className="ls-acts">
          <a className="sx-btn dark lg" href={`/studio/${e.id}/stage`} target="_blank"><IMonitor size={18} />Open stage display<IExternal size={15} /></a>
          <span className="sx-fine">Put it on a projector or TV. It updates by itself.</span>
        </div>
      </div>

      <div className="live-grid">
        <div className="live-main">
          {(soon.length > 0 || quiet.length > 0) && (
            <div className="attn">
              {soon.length > 0 && <div className="attn-card hot"><IClock size={20} /><div><b>{soon.length} closing within 15 minutes</b><span>{soon.slice(0, 3).map(i => `${i.title} (${countdown(i.effectiveClosesAt, now)})`).join(" · ")}</span></div></div>}
              {quiet.length > 0 && <div className="attn-card"><IAlert size={20} /><div><b>{quiet.length} with no bids yet</b><span>Worth a mention from the stage: {quiet.slice(0, 3).map(i => i.title).join(", ")}</span></div></div>}
            </div>
          )}
          <div className="board-head"><h2>Items</h2><span className="sx-muted">Sorted by what closes next</span></div>
          <div className="tiles">
            {order.map(i => <Tile key={i.id} item={i} now={now} on={focus === i.id} onClick={() => setFocus(focus === i.id ? null : i.id)} />)}
            {!order.length && <div className="sx-empty-card"><b>No items are visible yet</b><span>Add items in Set up, and they&rsquo;ll show here as bids land.</span></div>}
          </div>
        </div>
        <aside className="live-side">
          {focused ? <BidsFor item={focused} tz={e.timezone} onClose={() => setFocus(null)} /> : (
            <section className="feed-card">
              <div className="fc-head"><h3>Latest bids</h3>{e.phase === "open" && <span className="live-dot">Live</span>}</div>
              {!data.activity.length && <p className="sx-muted">Bids appear here the moment they land.</p>}
              <ol className="feed">
                {data.activity.slice(0, 14).map(a => (
                  <li key={a.id}>
                    <span className="f-time">{fmtClock(a.at, e.timezone)}</span>
                    <span className="f-t"><b>{a.business}</b><small>{a.name} · {titles.get(a.itemId)}</small></span>
                    <b className="f-amt">{formatMoney(a.amountMinor)}</b>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <People ctx={ctx} />
        </aside>
      </div>
    </div>
  );
}

function Tile({ item, now, on, onClick }: { item: Item; now: number; on: boolean; onClick: () => void }) {
  const left = new Date(item.effectiveClosesAt).getTime() - now;
  const prev = useRef(item.bidCount), [pulse, setPulse] = useState(0);
  useEffect(() => { if (item.bidCount > prev.current) setPulse(p => p + 1); prev.current = item.bidCount; }, [item.bidCount]);
  return (
    <button type="button" className={`tile${on ? " on" : ""} p-${item.phase}${item.phase === "open" && left < 10 * 60_000 ? " soon" : ""}`} onClick={onClick} key={pulse} data-pulse={pulse || undefined}>
      <span className="tile-img">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <ItemArt item={item} size="sm" />}<span className="tile-no">{String(item.position + 1).padStart(2, "0")}</span></span>
      <span className="tile-b">
        <b className="tile-t">{item.title}</b>
        <Amount minor={item.currentMinor ?? item.openingMinor} className="tile-amt" />
        <span className="tile-lead">{item.leader ? <><b>{item.leader.business}</b> · {item.bidCount} bid{item.bidCount === 1 ? "" : "s"}</> : item.phase === "scheduled" ? "Not open yet" : "No bids yet"}</span>
        <span className="tile-foot"><Status stage={item.phase} />{item.phase === "open" && <span className={`tile-left${left < 10 * 60_000 ? " hot" : ""}`}>{countdown(item.effectiveClosesAt, now)}</span>}</span>
      </span>
    </button>
  );
}

function BidsFor({ item, tz, onClose }: { item: Item; tz: string; onClose: () => void }) {
  return (
    <section className="feed-card">
      <div className="fc-head"><h3>{item.title}</h3><button type="button" className="sx-btn ghost sm" onClick={onClose}>All bids</button></div>
      <p className="sx-muted">Closes {fmtClock(item.effectiveClosesAt, tz)} · starts at {formatMoney(item.openingMinor)}</p>
      {!item.bids.length && <p className="sx-muted">No bids yet.</p>}
      <ol className="feed">
        {item.bids.map((b, n) => (
          <li key={b.id} className={n === 0 ? "top" : ""}>
            <span className="f-time">{fmtClock(b.at, tz)}</span>
            <span className="f-t"><b>{b.business}</b><small>{b.name}</small></span>
            <b className="f-amt">{formatMoney(b.amountMinor)}</b>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function People({ ctx }: { ctx: Ctx }) {
  const { data, reload, flash } = ctx, e = data.event;
  const [q, setQ] = useState(""), [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const shown = data.participants.filter(p => !q.trim() || `${p.name} ${p.business}`.toLowerCase().includes(q.trim().toLowerCase()));
  const setCanBid = async (p: Participant, canBid: boolean) => {
    const r = await api("PATCH", `/api/v1/host/events/${e.id}/participants/${p.id}`, { canBid }).catch(() => null);
    if (r && !r.ok) flash(errorText(r), "red"); else flash(canBid ? `${p.name} can bid again` : `${p.name}'s bidding is paused`);
    reload();
  };
  const rejoin = async (p: Participant) => {
    const r = await api("POST", `/api/v1/host/events/${e.id}/participants/${p.id}/rejoin`).catch(() => null);
    if (r?.ok) setCode({ name: p.name, code: r.data.code }); else flash(r ? errorText(r) : "Connection lost.", "red");
  };
  return (
    <section className="people-card">
      <div className="fc-head"><h3>People <span className="sx-muted">{data.participants.length}</span></h3><a className="sx-btn ghost sm" href={`/api/v1/host/events/${e.id}/export/participants`}>Export</a></div>
      {code && (
        <div className="rejoin">
          <span>Rejoin code for <b>{code.name}</b></span>
          <b className="rj-code">{code.code}</b>
          <small>One use, valid 30 minutes. On the new phone: open the event, tap &ldquo;Already joined on another phone?&rdquo; and enter it.</small>
          <button type="button" className="sx-btn ghost sm" onClick={() => setCode(null)}>Done</button>
        </div>
      )}
      {data.participants.length > 5 && <label className="sx-search"><ISearch size={17} /><input type="search" value={q} onChange={x => setQ(x.target.value)} placeholder="Find by name or business" aria-label="Find a participant" /></label>}
      {!data.participants.length ? <p className="sx-muted">Nobody has joined yet. Share the code to get started.</p> : (
        <ul className="people">
          {shown.slice(0, 40).map(p => (
            <li key={p.id} className={p.canBid ? "" : "paused"}>
              <span className="pp-mark">{p.business.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()}</span>
              <span className="pp-t"><b>{p.business}</b><small>{p.name} · {p.bidCount} bid{p.bidCount === 1 ? "" : "s"}{p.leadingCount ? ` · leading ${p.leadingCount}` : ""}{p.canBid ? "" : " · paused"}</small></span>
              <Menu label={`Options for ${p.name}`} trigger={<IMore size={18} />}>
                <button type="button" role="menuitem" onClick={() => rejoin(p)}>Rejoin code (new phone)</button>
                <button type="button" role="menuitem" onClick={() => setCanBid(p, !p.canBid)}>{p.canBid ? "Pause bidding" : "Let them bid again"}</button>
              </Menu>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A clock that ticks every second from the server's time. */
export function useTicking(serverNow: string) {
  const [base, setBase] = useState(() => ({ server: new Date(serverNow).getTime(), local: Date.now() }));
  const [, tick] = useState(0);
  useEffect(() => { setBase({ server: new Date(serverNow).getTime(), local: Date.now() }); }, [serverNow]);
  useEffect(() => { const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t); }, []);
  return base.server + (Date.now() - base.local);
}
