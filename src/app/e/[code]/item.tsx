"use client";
import { headline } from "../../../lib/display";
import { useEffect, useState } from "react";
import { fmtClock, fmtTime } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { IAlert, ICheck, IClock, IHistory, ITrophy } from "../../../lib/icons";
import { closingSoon, countdown, standing, type Item, type PendingBid, type Snapshot } from "./model";
import type { Nav } from "./participant";
import { Amount, Ed, ItemArt, LotTab, Mark, Photo, Pill, TimeLeft, useEdit, Watch } from "./ui";

type Props = { snap: Snapshot; now: number; nav: Nav; code: string; stale: boolean; pending: PendingBid | null; item: Item };

export function ItemPage({ snap, now, nav, code, stale, pending, item }: Props) {
  const me = snap.me!;
  const unconfirmed = pending?.itemId === item.id;
  const s = standing(item, unconfirmed), head = headline(item, unconfirmed);
  const tz = snap.event.timezone;
  const edit = useEdit();

  return (
    <article className={`ip tone-${s.tone}`}>
      <div className="ip-media">
        <Photo k={`item:${item.id}`} url={item.imageUrl} focal={item.imageFocal} className="hero" vt={`photo-${item.id}`} alt={item.title}><ItemArt item={item} /></Photo>
        <LotTab item={item} size="lg" />
        <Watch on={item.watching} size="lg" onToggle={() => nav.watch(item, !item.watching)} />
      </div>
      <div className="ip-body">
        <div className="ip-meta">
          {item.donor ? <span className="provided"><Mark name={item.donor} kind="sponsor" size={36} /><span><small>Provided by</small><b>{item.donor}</b></span></span> : <span />}
          {item.category && <span className="eyebrow">{item.category}</span>}
        </div>
        <Ed k={`item:${item.id}`} field="title" value={item.title} as="h1" className={`ip-title${item.title.length > 60 ? " long" : ""}`} placeholder="Item title" max={200} />
        <Ed k={`item:${item.id}`} field="short" value={item.short} as="p" className="ip-short" placeholder="One-line summary" max={500} />

        <StandingCard item={item} now={now} nav={nav} instructions={me.winnerInstructions} unconfirmed={unconfirmed} paused={!me.canBid} />

        <div className="pa-stub">
          <div className="stub-main">
            <span className="lbl">{head.label}</span>
            <Amount minor={head.amountMinor} className="xl" stale={stale} />
            <span className="stub-leader">
              {item.leader ? <><Mark name={item.leader.isMe ? "You" : item.leader.business} you={item.leader.isMe} size={24} /><span><b>{item.leader.isMe ? "You" : item.leader.business}</b> · {item.bidCount} bid{item.bidCount === 1 ? "" : "s"}</span></>
                : <span className="muted">{item.phase === "open" ? "No bids yet" : item.phase === "scheduled" ? "Opens soon" : "No bids"}</span>}
            </span>
          </div>
          <div className="stub-side">
            <div><span className="lbl">{item.phase === "scheduled" ? "Opens" : item.phase === "open" ? "Closes" : "Closed"}</span>
              <b className="n">{fmtClock(item.phase === "scheduled" ? item.opensAt : item.closesAt, tz)}</b>
              {item.phase === "open" && <span className={`tl-big${closingSoon(item, now) ? " soon" : ""}`}><IClock size={14} />{countdown(item.closesAt, now)}</span>}</div>
            {item.phase !== "closed" && <div><span className="lbl">Raises by</span><b className="n sm">{formatMoney(item.incrementMinor)}</b></div>}
          </div>
        </div>

        <ActionBar item={item} snap={snap} nav={nav} now={now} unconfirmed={unconfirmed} inline />

        {(item.description || edit) && <section className="prose"><h2>About this item</h2><Ed k={`item:${item.id}`} field="description" value={item.description} as="p" multiline placeholder="Describe the item: what it includes, any dates or limits." max={10000} /></section>}

        <section className="prose activity">
          <h2><IHistory size={20} />Bid activity</h2>
          <Activity item={item} tz={tz} />
        </section>

        <details className="howto">
          <summary>How bidding works</summary>
          <ul>
            <li>Bid at least the amount shown. Bids go up by {formatMoney(item.incrementMinor)}.</li>
            <li>You&rsquo;re leading only once your bid is recorded.</li>
            <li>If two people bid at once, the first one counts and the other sees the new minimum.</li>
            <li>When bidding closes, staff confirm the winner here.</li>
          </ul>
        </details>
      </div>
      <ActionBar item={item} snap={snap} nav={nav} now={now} unconfirmed={unconfirmed} />
    </article>
  );
}

function StandingCard({ item, now, nav, instructions, unconfirmed, paused }: { item: Item; now: number; nav: Nav; instructions: string; unconfirmed: boolean; paused: boolean }) {
  const s = standing(item, unconfirmed);
  if (paused && item.phase === "open") return <div className="standing t-grey"><IAlert size={26} /><div><b>Your bidding is paused</b><p>Talk to event staff to continue.</p></div></div>;
  switch (s.key) {
    case "leading": return <div className="standing t-green" key="leading"><span className="st-ic"><ICheck size={24} /></span><div><b>You&rsquo;re leading</b><p>We&rsquo;ll tell you if someone outbids you.</p></div></div>;
    case "outbid": return (
      <div className="standing t-red pulse-once" key="outbid">
        <span className="st-ic"><IAlert size={24} /></span>
        <div><b>You&rsquo;ve been outbid</b><p>Someone bid higher. Bid again to take the lead.</p></div>
      </div>
    );
    case "won": return <div className="standing t-marigold" key="won"><span className="st-ic"><ITrophy size={24} /></span><div><b>You won this item</b><p>{instructions || "The event staff will be in touch about collecting it."}</p></div></div>;
    case "awaiting": return <div className="standing t-hatch"><span className="st-ic"><IClock size={24} /></span><div><b>You had the top bid</b><p>Staff are confirming the winner. You&rsquo;ll see it here.</p></div></div>;
    case "lost": return <div className="standing t-grey"><div><b>{s.label}</b><p>Your highest was {formatMoney(item.myHighestMinor ?? 0)}. Thanks for bidding.</p></div></div>;
    case "withdrawn": return <div className="standing t-grey" key="withdrawn"><IAlert size={26} /><div><b>This item was withdrawn</b><p>{item.withdrawalMessage || "The host withdrew this item. Bidding is closed."}</p></div></div>;
    case "voided": return <div className="standing t-grey" key="voided"><IAlert size={26} /><div><b>Staff removed your bid</b><p>You can bid again while bidding is open.</p></div></div>;
    case "unconfirmed": return <div className="standing t-dashed"><span className="st-ic"><IAlert size={24} /></span><div><b>We couldn&rsquo;t confirm your last bid</b><p>Check its status before bidding again.</p></div></div>;
    default:
      return null; // closing soon is carried by the ticket's countdown and the action bar
  }
}

function Activity({ item, tz }: { item: Item; tz: string }) {
  const history = item.bidHistory ?? [];
  const topId = history.find(b => !b.voided)?.id;
  const who = (b: { isMe: boolean; id: string }) => b.isMe ? "You" : b.id === topId && item.leader ? item.leader.business : "Another bidder";
  return (
    <>
      <ol className="history">
        {history.map(b => (
          <li key={b.id} className={`${b.isMe ? "mine" : ""}${b.id === topId ? " top" : ""}${b.voided ? " voided" : ""}`}>
            <Mark name={who(b)} you={b.isMe} size={34} />
            <span className="h-who"><b>{who(b)}</b><span>{b.voided ? "Removed by staff" : b.id === topId ? (item.phase === "closed" ? "Final bid" : "Top bid") : fmtClock(b.decidedAt, tz)}</span></span>
            <span className="h-amt"><b className="amt">{formatMoney(b.amountMinor)}</b></span>
          </li>
        ))}
        <li className="opening"><span className="h-dot" aria-hidden="true" /><span className="h-who"><b>Starting bid</b></span><span className="h-amt"><b className="amt">{formatMoney(item.openingMinor)}</b></span></li>
      </ol>
      {item.bidCount > 0 && <p className="fine">{item.bidCount} bid{item.bidCount === 1 ? "" : "s"}{item.myBidCount ? `, ${item.myBidCount} from you` : ""}.</p>}
    </>
  );
}

export function ActionBar({ item, snap, nav, now, unconfirmed, inline = false }: { item: Item; snap: Snapshot; nav: Nav; now: number; unconfirmed: boolean; inline?: boolean }) {
  const me = snap.me!, s = standing(item, unconfirmed);
  const cls = `pa-actionbar${inline ? " inline" : ""} tone-${s.tone}`;
  if (item.phase === "scheduled") return <div className={cls}><div className="ab-row"><div className="ab-amt"><span className="lbl">Opens</span><b className="ab-big">{fmtTime(item.opensAt, snap.event.timezone)}</b></div><button type="button" className="btn primary lg" disabled>Not open yet</button></div></div>;
  if (item.phase === "closed") return null; // the standing card and the ticket already say it's closed and what it sold for
  if (unconfirmed) return <div className={cls}><button type="button" className="btn primary lg block" onClick={e => { e.currentTarget.focus({ preventScroll: true }); nav.openSheet(item); }}>Check bid status</button></div>;
  if (item.leader?.isMe) return null; // nothing to do; the standing card and the ticket already say you lead
  const outbid = s.key === "outbid", min = item.minimumNextMinor;
  return (
    <div className={cls}>
      {closingSoon(item, now) && <span className="ab-soon"><TimeLeft item={item} now={now} /></span>}
      <button type="button" className="btn primary lg block" disabled={min === null || !me.canBid} onClick={e => { e.currentTarget.focus({ preventScroll: true }); nav.openSheet(item, outbid && min !== null ? min : undefined); }}>
        {min !== null ? <span>Bid <Amount minor={min} /></span> : "Bid"}
      </button>
    </div>
  );
}
