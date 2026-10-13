"use client";
import { useEffect, useState } from "react";
import { fmtClock, fmtTime } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { IAlert, ICheck, IClock, IHistory, ITrophy } from "../../../lib/icons";
import { closingSoon, countdown, itemLog, standing, type Item, type LogEntry, type PendingBid, type Snapshot } from "./model";
import type { Nav } from "./participant";
import { Amount, ItemArt, LotTab, Mark, Photo, Pill, TimeLeft, Watch } from "./ui";

type Props = { snap: Snapshot; now: number; nav: Nav; code: string; stale: boolean; pending: PendingBid | null; item: Item };

export function ItemPage({ snap, now, nav, code, stale, pending, item }: Props) {
  const me = snap.me!;
  const unconfirmed = pending?.itemId === item.id;
  const s = standing(item, unconfirmed);
  const [log, setLog] = useState<LogEntry[]>([]);
  useEffect(() => { setLog(itemLog(code, item.id)); }, [code, item.id, item.currentMinor, item.myBidCount]);
  const tz = snap.event.timezone;

  return (
    <article className={`ip tone-${s.tone}`}>
      <div className="ip-media">
        <Photo url={item.imageUrl} className="hero" vt={`photo-${item.id}`} alt={item.title}><ItemArt item={item} /></Photo>
        <LotTab item={item} size="lg" />
        <Watch on={item.watching} size="lg" onToggle={() => nav.watch(item, !item.watching)} />
      </div>
      <div className="ip-body">
        <div className="ip-meta">
          {item.donor ? <span className="provided"><Mark name={item.donor} kind="sponsor" size={36} /><span><small>Provided by</small><b>{item.donor}</b></span></span> : <span />}
          {item.category && <span className="eyebrow">{item.category}</span>}
        </div>
        <h1 className="ip-title">{item.title}</h1>
        {item.short && <p className="ip-short">{item.short}</p>}

        <StandingCard item={item} now={now} nav={nav} instructions={me.winnerInstructions} unconfirmed={unconfirmed} paused={!me.canBid} />

        <div className="pa-stub">
          <div className="stub-main">
            <span className="lbl">{item.currentMinor === null ? "Starting bid" : item.phase === "closed" ? "Final bid" : "Current bid"}</span>
            <Amount minor={item.currentMinor ?? item.openingMinor} className="xl" stale={stale} />
            <span className="stub-leader">
              {item.leader ? <><Mark name={item.leader.isMe ? "You" : item.leader.business} you={item.leader.isMe} size={24} /><span><b>{item.leader.isMe ? "You" : item.leader.business}</b> · {item.bidCount} bid{item.bidCount === 1 ? "" : "s"}</span></>
                : <span className="muted">{item.phase === "open" ? "No bids yet. Be the first." : item.phase === "scheduled" ? "Opens soon" : "No bids"}</span>}
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

        {item.description && <section className="prose"><h2>About this item</h2><p>{item.description}</p></section>}

        <section className="prose activity">
          <h2><IHistory size={20} />Bid activity</h2>
          <Activity item={item} log={log} tz={tz} />
        </section>

        <details className="howto">
          <summary>How bidding works</summary>
          <ul>
            <li>Each bid must be at least the minimum shown. It goes up by {formatMoney(item.incrementMinor)} right now.</li>
            <li>Your bid counts once the event&rsquo;s server records it. You&rsquo;ll see &ldquo;You&rsquo;re leading&rdquo; only then.</li>
            <li>The leader can&rsquo;t outbid themselves. If someone bids at the same moment, one bid wins and the other sees the new minimum.</li>
            <li>When bidding closes, staff confirm the winner. Winners see a message here with what to do next.</li>
          </ul>
        </details>
      </div>
      <ActionBar item={item} snap={snap} nav={nav} now={now} unconfirmed={unconfirmed} />
    </article>
  );
}

function StandingCard({ item, now, nav, instructions, unconfirmed, paused }: { item: Item; now: number; nav: Nav; instructions: string; unconfirmed: boolean; paused: boolean }) {
  const s = standing(item, unconfirmed);
  if (paused && item.phase === "open") return <div className="standing t-grey"><IAlert size={26} /><div><b>Your bidding is paused</b><p>Talk to the event staff to continue.</p></div></div>;
  switch (s.key) {
    case "leading": return <div className="standing t-green" key="leading"><span className="st-ic"><ICheck size={24} /></span><div><b>You&rsquo;re leading</b><p>Your {formatMoney(item.currentMinor!)} bid is the top bid{closingSoon(item, now) ? `, with ${countdown(item.closesAt, now)} to go` : ""}. We&rsquo;ll tell you if someone outbids you.</p></div></div>;
    case "outbid": return (
      <div className="standing t-red pulse-once" key="outbid">
        <span className="st-ic"><IAlert size={24} /></span>
        <div><b>You&rsquo;ve been outbid</b><p>{item.leader?.business} leads at {formatMoney(item.currentMinor!)}. Your highest was {formatMoney(item.myHighestMinor ?? 0)}.{item.minimumNextMinor !== null ? ` One tap below bids ${formatMoney(item.minimumNextMinor)}.` : ""}</p></div>
      </div>
    );
    case "won": return <div className="standing t-marigold" key="won"><span className="st-ic"><ITrophy size={24} /></span><div><b>You won this item</b><p>{instructions || "The event staff will be in touch about collecting it."}</p></div></div>;
    case "awaiting": return <div className="standing t-hatch"><span className="st-ic"><IClock size={24} /></span><div><b>You had the top bid</b><p>Bidding has closed. Staff confirm winners; you&rsquo;ll see it here when they do.</p></div></div>;
    case "lost": return <div className="standing t-grey"><div><b>{s.label}</b><p>Your highest bid was {formatMoney(item.myHighestMinor ?? 0)}. Thanks for bidding.</p></div></div>;
    case "unconfirmed": return <div className="standing t-dashed"><span className="st-ic"><IAlert size={24} /></span><div><b>Your last bid is unconfirmed</b><p>It may or may not have gone through. Check its status before bidding again.</p></div></div>;
    default:
      if (closingSoon(item, now)) return <div className="standing t-amber"><span className="st-ic"><IClock size={24} /></span><div><b>Closing soon</b><p><TimeLeft item={item} now={now} /> · last chance to bid.</p></div></div>;
      return null;
  }
}

function Activity({ item, log, tz }: { item: Item; log: LogEntry[]; tz: string }) {
  const rows = log.filter(e => e.amountMinor !== item.currentMinor || e.kind === "mine");
  const topMine = log.find(e => e.kind === "mine" && e.amountMinor === item.currentMinor);
  return (
    <>
      <ol className="history">
        {item.currentMinor !== null && item.leader && (
          <li className={`top${item.leader.isMe ? " mine" : ""}`}>
            <Mark name={item.leader.isMe ? "You" : item.leader.business} you={item.leader.isMe} size={34} />
            <span className="h-who"><b>{item.leader.isMe ? "You" : item.leader.business}</b><span>{item.phase === "closed" ? "Top bid when bidding closed" : "Top bid now"}{topMine ? ` · ${fmtClock(topMine.at, tz)}` : ""}</span></span>
            <span className="h-amt"><b className="amt">{formatMoney(item.currentMinor)}</b><span className="top">Top</span></span>
          </li>
        )}
        {rows.filter(e => !(e.kind === "mine" && e.amountMinor === item.currentMinor && item.leader?.isMe)).map(e => (
          <li key={`${e.kind}-${e.amountMinor}`} className={e.kind === "mine" ? "mine" : ""}>
            <Mark name={e.kind === "mine" ? "You" : e.business ?? "?"} you={e.kind === "mine"} size={34} />
            <span className="h-who"><b>{e.kind === "mine" ? "Your bid" : e.business}</b><span>{e.kind === "mine" ? `Recorded ${fmtClock(e.at, tz)}` : `Seen ${fmtClock(e.at, tz)}`}</span></span>
            <span className="h-amt"><b className="amt">{formatMoney(e.amountMinor)}</b></span>
          </li>
        ))}
        <li className="opening"><span className="h-dot" aria-hidden="true" /><span className="h-who"><b>Starting bid</b><span>Set by the host</span></span><span className="h-amt"><b className="amt">{formatMoney(item.openingMinor)}</b></span></li>
      </ol>
      <p className="fine">{item.bidCount} bid{item.bidCount === 1 ? "" : "s"} placed in total{item.myBidCount ? `, ${item.myBidCount} by you` : ""}. Times show when your bids were recorded, or when this phone first saw a new top bid.</p>
    </>
  );
}

export function ActionBar({ item, snap, nav, now, unconfirmed, inline = false }: { item: Item; snap: Snapshot; nav: Nav; now: number; unconfirmed: boolean; inline?: boolean }) {
  const me = snap.me!, s = standing(item, unconfirmed);
  const cls = `pa-actionbar${inline ? " inline" : ""} tone-${s.tone}`;
  const forLine = <p className="for">Bidding as <Mark name={me.businessName} you size={20} /><b>{me.businessName}</b></p>;
  if (item.phase === "scheduled") return <div className={cls}><div className="ab-row"><div className="ab-amt"><span className="lbl">Opens</span><b className="ab-big">{fmtTime(item.opensAt, snap.event.timezone)}</b></div><button type="button" className="btn primary lg" disabled>Not open yet</button></div></div>;
  if (item.phase === "closed") return (
    <div className={cls}><div className="ab-row">
      <div className="ab-amt"><Pill s={s} /><span className="ab-note">Final {formatMoney(item.currentMinor ?? item.openingMinor)}</span></div>
      <button type="button" className="btn quiet lg" onClick={() => nav.tab("mine")}>My bids</button>
    </div></div>
  );
  if (unconfirmed) return <div className={cls}>{forLine}<div className="ab-row"><div className="ab-amt"><Pill s={s} /></div><button type="button" className="btn primary lg" onClick={() => nav.openSheet(item)}>Check bid status</button></div></div>;
  if (item.leader?.isMe) return (
    <div className={cls}>{forLine}<div className="ab-row">
      <div className="ab-amt"><span className="ab-lead"><ICheck size={20} />You&rsquo;re leading</span><Amount minor={item.currentMinor!} className="ab-big" /></div>
      <button type="button" className="btn quiet lg" disabled>Top bid is yours</button>
    </div></div>
  );
  const outbid = s.key === "outbid", min = item.minimumNextMinor;
  return (
    <div className={cls}>{forLine}<div className="ab-row">
      <div className="ab-amt"><span className="lbl">{outbid ? "Outbid · next bid" : "Next bid at least"}</span>{min !== null ? <Amount minor={min} className="ab-big" /> : <b className="ab-big">—</b>}</div>
      <button type="button" className={`btn primary lg${outbid ? " urgent" : ""}`} disabled={min === null || !me.canBid} onClick={() => nav.openSheet(item, outbid && min !== null ? min : undefined)}>
        {outbid && min !== null ? `Bid ${formatMoney(min)}` : "Place a bid"}
      </button>
    </div>{closingSoon(item, now) && !inline && <span className="ab-soon"><TimeLeft item={item} now={now} /></span>}</div>
  );
}
