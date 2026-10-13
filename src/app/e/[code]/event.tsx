"use client";
import { fmtTime } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { ICalendar, IGrid, IHeart, IPin, ITicket } from "../../../lib/icons";
import type { PendingBid, Snapshot } from "./model";
import type { Nav } from "./participant";
import { EventClock } from "./catalog";
import { EventHero, Facts, LinkRow, Mark, SponsorGrid } from "./ui";

type Props = { snap: Snapshot; now: number; nav: Nav; code: string; stale: boolean; pending: PendingBid | null };

export function EventPage({ snap, now, nav }: Props) {
  const e = snap.event, me = snap.me!;
  const d = e.donations;
  const top = snap.items.reduce((best, i) => (i.currentMinor ?? 0) > (best?.currentMinor ?? 0) ? i : best, null as null | typeof snap.items[number]);
  return (
    <div className="event-page">
      <EventHero event={e} eyebrow={e.venue || "Welcome"}><p className="ehero-clock"><EventClock snap={snap} now={now} /></p></EventHero>
      <div className="ev-body">
        <div className="ev-intro">
          <div className="ev-welcome">
            <h2>Welcome</h2>
            <p className="lead">{e.welcome || "Browse the items and bid from your phone. Good luck!"}</p>
            <div className="ev-actions">
              <button type="button" className="btn primary lg" onClick={() => nav.tab("items")}><IGrid size={20} />Browse {snap.items.length} items</button>
              <button type="button" className="btn quiet lg" onClick={() => nav.tab("mine")}><ITicket size={20} />My bids</button>
            </div>
          </div>
          <div className="ev-facts">
            <Facts event={e} items={snap.items.length} />
            <ul className="ev-when">
              <li><ICalendar size={20} /><span><b>{fmtTime(e.startsAt, e.timezone)}</b><small>to {fmtTime(e.endsAt, e.timezone)}</small></span></li>
              {e.venue && <li><IPin size={20} /><span><b>{e.venue}</b><small>Times shown in {e.timezone.replace(/_/g, " ")}</small></span></li>}
            </ul>
            {top?.currentMinor && <p className="ev-hot">Hottest right now: <b>{top.title}</b> at <b className="amt">{formatMoney(top.currentMinor)}</b></p>}
          </div>
        </div>

        {d.enabled && (
          <section className="ev-give">
            <div><span className="lbl">Donations</span><h2>Give to a cause tonight</h2>
              <p>{d.open ? `Give to ${d.recipients.map(r => r.name).join(", ") || "our nonprofits"}: $25, $50, $100 or any amount.` : "Donations are closed. Thank you to everyone who gave."}</p></div>
            {d.open && <button type="button" className="btn quiet lg" onClick={() => nav.tab("give")}><IHeart size={20} />Donate</button>}
          </section>
        )}

        <section className="prose">
          <h2>How winning works</h2>
          <ol className="steps">
            <li><b>Bid at least the minimum.</b> Each item shows the next amount. Steps grow as the price climbs.</li>
            <li><b>Watch your standing.</b> &ldquo;You&rsquo;re leading&rdquo; appears only once your bid is recorded. If someone outbids you, we&rsquo;ll tell you right away.</li>
            <li><b>The event clock decides.</b> Items close at the time shown, by the event&rsquo;s clock, not your phone&rsquo;s.</li>
            <li><b>Staff confirm winners.</b> Winners see &ldquo;You won&rdquo; and how to collect, right here.</li>
          </ol>
        </section>

        <SponsorGrid sponsors={e.sponsors} />

        <section className="joined">
          <Mark name={me.businessName} you size={48} />
          <div><span className="lbl">You joined as</span><b>{me.displayName}</b><small>{me.businessName}</small></div>
        </section>
        <p className="fine center">This phone remembers you{e.accessEndsAt ? ` until ${fmtTime(e.accessEndsAt, e.timezone)}` : ""}. Lost your phone? Event staff can move you to a new one with a rejoin code.</p>
        <div className="linkrows">
          <LinkRow icon={<IGrid size={20} />} title="All items" sub={`${snap.items.length} in the catalogue`} onClick={() => nav.tab("items")} />
        </div>
      </div>
    </div>
  );
}
