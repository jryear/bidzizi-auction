"use client";
import { fmtTime } from "../../../lib/api";
import { IGrid, IHeart } from "../../../lib/icons";
import type { PendingBid, Snapshot } from "./model";
import type { Nav } from "./participant";
import { EventClock } from "./catalog";
import { EventHero, Facts, Mark, SponsorGrid } from "./ui";

type Props = { snap: Snapshot; now: number; nav: Nav; code: string; stale: boolean; pending: PendingBid | null };

export function EventPage({ snap, now, nav }: Props) {
  const e = snap.event, me = snap.me!;
  const d = e.donations;
  return (
    <div className="event-page">
      <EventHero event={e} eyebrow={e.venue || "Welcome"}><p className="ehero-clock"><EventClock snap={snap} now={now} /></p></EventHero>
      <div className="ev-body">
        <div className="ev-intro">
          <div className="ev-welcome">
            {e.welcome && <p className="lead">{e.welcome}</p>}
            <div className="ev-actions">
              <button type="button" className="btn primary lg" onClick={() => nav.tab("items")}><IGrid size={20} />Browse {snap.items.length} item{snap.items.length === 1 ? "" : "s"}</button>
            </div>
          </div>
          <div className="ev-facts">
            <Facts event={e} items={snap.items.length} />
          </div>
        </div>

        {d.enabled && (
          <section className="ev-give">
            <div><h2>{d.open ? "Give to a cause" : "Donations are closed"}</h2>
              <p>{d.open ? d.recipients.map(r => r.name).join(" · ") || "Our nonprofits" : "Thank you to everyone who gave."}</p></div>
            {d.open && <button type="button" className="btn quiet lg" onClick={() => nav.tab("give")}><IHeart size={20} />Donate</button>}
          </section>
        )}

        <section className="prose">
          <h2>How winning works</h2>
          <ol className="steps">
            <li><b>Bid at least the amount shown.</b> We&rsquo;ll tell you if someone outbids you.</li>
            <li><b>Items close at the time shown,</b> by the event&rsquo;s clock.</li>
            <li><b>Staff confirm winners.</b> If you win, you&rsquo;ll see it here with how to collect.</li>
          </ol>
        </section>

        <SponsorGrid sponsors={e.sponsors} />

        <section className="joined">
          <Mark name={me.businessName} you size={44} />
          <div><b>{me.displayName}</b><small>{me.businessName}</small>
            <p className="fine">This phone remembers you{e.accessEndsAt ? ` until ${fmtTime(e.accessEndsAt, e.timezone)}` : ""}. New phone? Ask staff for a rejoin code.</p></div>
        </section>
      </div>
    </div>
  );
}
