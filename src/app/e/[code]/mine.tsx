"use client";
import { useState } from "react";
import { headline } from "../../../lib/display";
import { fmtClock } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { IChevD, IHeart, ITicket, ITrophy } from "../../../lib/icons";
import { standing, type Item, type PendingBid, type Snapshot } from "./model";
import type { Nav } from "./participant";
import { Amount, EmptyState, ItemArt, Pill, TimeLeft } from "./ui";

type Props = { snap: Snapshot; now: number; nav: Nav; code: string; stale: boolean; pending: PendingBid | null };

const GROUPS = [
  { key: "attention", title: "Outbid" },
  { key: "won", title: "You won" },
  { key: "leading", title: "Leading" },
  { key: "awaiting", title: "Staff confirming" },
  { key: "closed", title: "Closed" },
] as const;

function groupOf(item: Item, pendingId?: string): typeof GROUPS[number]["key"] {
  const k = standing(item, item.id === pendingId).key;
  if (k === "outbid" || k === "unconfirmed") return "attention";
  if (k === "won") return "won";
  if (k === "leading") return "leading";
  if (k === "awaiting") return "awaiting";
  return "closed";
}

export function MyBids({ snap, now, nav, code, stale, pending }: Props) {
  const mine = snap.items.filter(i => i.myBidCount > 0 || i.award?.isMe || i.id === pending?.itemId);
  const pledges = snap.me!.pledges;
  const leadingTotal = mine.filter(i => i.leader?.isMe && i.phase === "open").reduce((s, i) => s + (i.currentMinor ?? 0), 0);
  const wonTotal = mine.filter(i => i.award?.isMe).reduce((s, i) => s + (i.award?.amountMinor ?? 0), 0);
  return (
    <div className="mine-layout">
      <section className="page-head">
        <h1>My bids</h1>
        {mine.length > 0 && <p className="sub">{mine.length} item{mine.length === 1 ? "" : "s"}{wonTotal ? <> · won <b className="amt">{formatMoney(wonTotal)}</b></> : leadingTotal ? <> · leading at <b className="amt">{formatMoney(leadingTotal)}</b></> : null}</p>}
      </section>
      <aside className="mine-rail" aria-label="Your night">
        <div className="rail-pass">
          <span className="lbl">Your night</span>
          <div className="rp-grid">
            <div><span>Won</span><b>{mine.filter(i => i.award?.isMe).length}</b></div>
            <div><span>Leading</span><b>{mine.filter(i => i.leader?.isMe && i.phase === "open").length}</b></div>
            <div><span>Outbid</span><b className={mine.some(i => standing(i).key === "outbid") ? "hot" : ""}>{mine.filter(i => standing(i).key === "outbid").length}</b></div>
            <div><span>Given</span><b className="amt">{formatMoney(pledges.reduce((s, p) => s + p.amountMinor, 0))}</b></div>
          </div>
        </div>
        {snap.me!.winnerInstructions && mine.some(i => i.award?.isMe) && (
          <div className="winner-note"><ITrophy size={22} /><div><b>What to do next</b><p>{snap.me!.winnerInstructions}</p></div></div>
        )}
      </aside>
      {!mine.length && !pledges.length ? (
        <EmptyState icon={<ITicket size={28} />} title="No bids yet">
          <p>Items you bid on show up here.</p>
          <button type="button" className="btn primary" onClick={() => nav.tab("items")}>Browse items</button>
        </EmptyState>
      ) : (
        <div className="bids">
          {GROUPS.map(g => {
            const list = mine.filter(i => groupOf(i, pending?.itemId) === g.key);
            if (!list.length) return null;
            return (
              <section key={g.key} className={`b-sec g-${g.key}`}>
                <h2>{g.title}<span className="b-count">{list.length}</span></h2>
                <div className="tickets">{list.map(i => <Ticket key={i.id} item={i} now={now} nav={nav} code={code} stale={stale} unconfirmed={i.id === pending?.itemId} tz={snap.event.timezone} />)}</div>
              </section>
            );
          })}
          {pledges.length > 0 && (
            <section className="b-sec g-give">
              <h2>Your donations<span className="b-count">{pledges.length}</span></h2>
              <div className="tickets">
                {pledges.map(p => (
                  <article key={p.id} className="tk tone-ink give">
                    <div className="tk-main"><span className="tk-thumb heart"><IHeart size={24} filled /></span>
                      <div className="tk-t"><span className="lbl">Donation</span><h3>{p.recipientName}</h3><p>Recorded {fmtClock(p.recordedAt, snap.event.timezone)}</p></div></div>
                    <div className="tk-stub"><span className="lbl">Given</span><b className="amt">{formatMoney(p.amountMinor)}</b></div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Ticket({ item, now, nav, stale, unconfirmed, tz }: { item: Item; now: number; nav: Nav; code: string; stale: boolean; unconfirmed: boolean; tz: string }) {
  const s = standing(item, unconfirmed), head = headline(item, unconfirmed);
  const [open, setOpen] = useState(false);
  // Your own bids live in the history, not on the ticket's face: the face leads with the top bid (passthrough 1).
  const yours = (item.bidHistory ?? []).filter(b => b.isMe);
  const showHistory = yours.length > 0 && !head.yours;
  return (
    <article className={`tk tone-${s.tone}${s.key === "outbid" ? " shake-once" : ""}`}>
      <button type="button" className="tk-main" onClick={() => nav.openItem(item.id)}>
        <span className="tk-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : <ItemArt item={item} size="sm" />}</span>
        <span className="tk-t">
          <h3>{item.title}</h3>
          {s.key === "unconfirmed" ? <span className="tk-pills"><Pill s={s} small /></span>
            : item.phase === "open" && <span className="tk-pills"><TimeLeft item={item} now={now} /></span>}
        </span>
      </button>
      <div className="tk-stub">
        <span className="lbl">{head.label}</span>
        <Amount minor={head.amountMinor} stale={stale} />
      </div>
      {(s.key === "outbid" && item.minimumNextMinor !== null || s.key === "unconfirmed") && (
        <div className="tk-act">
          {s.key === "outbid" ? <button type="button" className="btn primary" onClick={() => nav.openSheet(item, item.minimumNextMinor!)}>Bid {formatMoney(item.minimumNextMinor!)}</button>
            : <button type="button" className="btn primary" onClick={() => nav.openSheet(item)}>Check bid status</button>}
        </div>
      )}
      {showHistory && (
        <div className="tk-history">
          <button type="button" className="tk-more" aria-expanded={open} onClick={() => setOpen(!open)}>Your bids ({yours.length})<IChevD size={16} /></button>
          {open && (
            <ol className="tk-hist">
              {yours.map(b => <li key={b.id} className={b.voided ? "muted" : ""}><span>{b.voided ? "Removed by staff" : fmtClock(b.decidedAt, tz)}</span><b className="amt">{formatMoney(b.amountMinor)}</b></li>)}
            </ol>
          )}
        </div>
      )}
    </article>
  );
}
