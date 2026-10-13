"use client";
import { photoStyle } from "../../../../lib/photo";
// The stage display: for a projector or TV in the room. Read-only, self-updating, legible from the back of the hall.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { api } from "../../../../lib/api";
import { formatMoney } from "../../../../lib/money";
import { THEMES } from "../../../../lib/templates";
import { IExpand, ITrophy } from "../../../../lib/icons";
import { countdown } from "../../../e/[code]/model";
import { Amount, ItemArt } from "../../../e/[code]/ui";
// The stage's own endpoint: only what the room may see, with bidder names already masked by the server.
export type StageItem = { id: string; position: number; title: string; donor: string; category: string; imageUrl: string | null; imageFocal?: import("../../../../lib/photo").FocalPoint; openingMinor: number;
  currentMinor: number | null; bidCount: number; phase: "scheduled" | "open" | "closed"; effectiveClosesAt: string; leader: { name: string; business: string } | null };
export type StageData = { serverNow: string; event: { id: string; name: string; code: string; theme: string; status: "draft" | "live"; startsAt: string; endsAt: string; phase: string; accentColor: string | null };
  items: StageItem[]; activity: { id: string; itemId: string; amountMinor: number; at: string; name: string; business: string }[]; bidders: number; givenMinor: number };
import { Qr } from "../../kit";
import { useTicking } from "../live";
import "../../../e/[code]/participant.css";
import "../../studio.css";

const SPOT_MS = 9000, NEW_MS = 7000;

export default function Stage({ eventId }: { eventId: string }) {
  const [data, setData] = useState<StageData | null>(null);
  const [signedOut, setSignedOut] = useState(false), [offline, setOffline] = useState(false);
  const [origin, setOrigin] = useState("");
  const load = useCallback(async () => {
    const r = await api<StageData>("GET", `/api/v1/host/events/${eventId}/stage`).catch(() => null);
    if (!r) { setOffline(true); return; }
    if (r.status === 401) { setSignedOut(true); return; }
    if (r.ok) { setData(r.data); setOffline(false); }
  }, [eventId]);
  useEffect(() => { setOrigin(location.origin); load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [load]);

  // Hide the cursor when the mouse rests, like a slideshow.
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), 2500); };
    wake(); window.addEventListener("mousemove", wake);
    return () => { clearTimeout(t); window.removeEventListener("mousemove", wake); };
  }, []);

  if (signedOut) return <main className="stage s-msg"><p>Sign in to Studio on this computer, then reload.</p><a href="/studio">Open Studio</a></main>;
  if (!data) return <main className="stage s-msg"><span className="dots light"><i /><i /><i /></span><p>{offline ? "Can't reach BidZizi. Retrying…" : "Getting the stage ready…"}</p></main>;
  return <StageView data={data} origin={origin} idle={idle} offline={offline} />;
}

export function StageView({ data, origin, idle, offline }: { data: StageData; origin: string; idle: boolean; offline: boolean }) {
  const e = data.event, now = useTicking(data.serverNow);
  const base = THEMES.find(t => t.id === e.theme) ?? THEMES[0], theme = { ...base, accent: e.accentColor ?? base.accent };
  const live = data.items, activity = data.activity;
  const raised = live.reduce((s, i) => s + (i.currentMinor ?? 0), 0);
  const t = (s: string) => new Date(s).getTime();
  const ended = e.status === "live" && e.phase === "closed";

  // Spotlight: rotate through open items; jump to an item the moment it gets a new bid.
  const [spot, setSpot] = useState(0);
  const [fresh, setFresh] = useState<{ id: string; at: number } | null>(null);
  const lastBid = useRef<string | null>(null);
  const pool = useMemo(() => {
    const open = live.filter(i => i.phase === "open");
    return (open.length ? open : live).slice().sort((a, b) => a.position - b.position);
  }, [live]);
  useEffect(() => {
    const top = activity[0];
    if (top && lastBid.current && top.id !== lastBid.current) setFresh({ id: top.itemId, at: Date.now() });
    lastBid.current = top?.id ?? "none";
  }, [activity]);
  useEffect(() => { const timer = setInterval(() => setSpot(s => s + 1), SPOT_MS); return () => clearInterval(timer); }, []);
  const freshItem = fresh && Date.now() - fresh.at < NEW_MS ? live.find(i => i.id === fresh.id) : undefined;
  const item: StageItem | undefined = freshItem ?? pool[spot % Math.max(pool.length, 1)];
  const soon = live.filter(i => i.phase === "open" && t(i.effectiveClosesAt) - now < 10 * 60_000).sort((a, b) => t(a.effectiveClosesAt) - t(b.effectiveClosesAt));
  const bidders = data.bidders;
  const titles = new Map(data.items.map(i => [i.id, i.title]));
  const host = origin.replace(/^https?:\/\//, "");

  return (
    <main className={`stage${idle ? " idle" : ""}`} style={{ "--st-ink": theme.ink, "--st-accent": theme.accent, "--st-paper": theme.paper } as CSSProperties}>
      <div className="st-bg" aria-hidden="true">{item?.imageUrl && <img key={item.id} style={photoStyle(item.imageFocal)} src={item.imageUrl} alt="" />}</div>
      <header className="st-top">
        <span className="st-brand">Bid<i>Zizi</i></span>
        <span className="st-event">{e.name}</span>
        <span className="grow" />
        {e.status === "draft" ? <span className="st-pill draft">Preview · not live</span> : ended ? <span className="st-pill">Bidding closed</span> : e.phase === "open" ? <span className="st-pill live"><i />Live</span> : <span className="st-pill">Starting soon</span>}
        {offline && <span className="st-pill warn">Reconnecting…</span>}
        <button type="button" className="st-fs" aria-label="Full screen" onClick={() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {})}><IExpand size={20} /></button>
      </header>

      {ended ? <Finale data={data} raised={raised} /> : (
        <section className="st-main">
          {item ? (
            <div className="spot" key={item.id + (freshItem ? "-fresh" : "")}>
              <div className="spot-img">{item.imageUrl ? <img style={photoStyle(item.imageFocal)} src={item.imageUrl} alt="" /> : <ItemArt item={item} />}<span className="spot-no">Item {String(item.position + 1).padStart(2, "0")}</span></div>
              <div className="spot-t">
                {freshItem && item.phase === "open" ? <span className="spot-flag new">New bid</span> : t(item.effectiveClosesAt) - now < 10 * 60_000 && item.phase === "open" ? <span className="spot-flag soon">Closing soon</span> : <span className="spot-flag">{item.category || "Now bidding"}</span>}
                <h1>{item.title}</h1>
                {item.donor && <p className="spot-donor">Provided by {item.donor}</p>}
                <div className="spot-amt"><span>{item.currentMinor === null ? "Starting bid" : item.phase === "closed" ? "Final bid" : "Top bid"}</span><Amount minor={item.currentMinor ?? item.openingMinor} className="st-big" /></div>
                <p className="spot-lead">{item.leader ? <><b>{item.leader.business}</b> {item.phase === "closed" ? "had the top bid" : "leads"} · {item.bidCount} bid{item.bidCount === 1 ? "" : "s"}</> : item.phase === "open" ? "No bids yet. Yours could be the first." : item.phase === "scheduled" ? "Opens soon" : "No bids"}</p>
                {item.phase === "open" && <p className={`spot-clock${t(item.effectiveClosesAt) - now < 10 * 60_000 ? " hot" : ""}`}>Closes in <b>{countdown(item.effectiveClosesAt, now)}</b></p>}
              </div>
            </div>
          ) : <div className="spot empty"><h1>Items are coming</h1><p>Join now and you&rsquo;ll see them the moment they open.</p></div>}

          <aside className="st-join">
            <span className="sj-eyebrow">Join from your phone</span>
            {origin && <Qr text={`${origin}/e/${e.code}`} label="QR code to join" className="sj-qr" dark={theme.ink} />}
            <span className="sj-or">or go to <b>{host}/join</b></span>
            <span className="sj-code">{e.code}</span>
          </aside>
        </section>
      )}

      {!ended && (
        <footer className="st-foot">
          <div className="st-stats">
            <div><span>Raised</span><Amount minor={raised} className="st-stat" /></div>
            <div><span>{e.phase === "open" ? "Bidding ends in" : e.status === "draft" ? "Opens" : "Opens in"}</span><b className="st-stat">{e.phase === "open" ? countdown(e.endsAt, now) : e.status === "draft" ? new Date(e.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : countdown(e.startsAt, now)}</b></div>
            <div><span>Bidders</span><b className="st-stat">{bidders}</b></div>
            {soon.length > 0 && <div className="st-soon"><span>Closing soon</span><b>{soon.slice(0, 2).map(i => `${i.title} · ${countdown(i.effectiveClosesAt, now)}`).join("   ")}</b></div>}
          </div>
          <div className="ticker" aria-live="polite">
            <span className="tk-label">Latest</span>
            <ol>{activity.slice(0, 6).map((a, n) => <li key={a.id} className={n === 0 ? "first" : ""}><b>{a.business}</b> bid <b className="tk-amt">{formatMoney(a.amountMinor)}</b> on {titles.get(a.itemId)}</li>)}
              {!activity.length && <li>Bids will appear here the moment they land.</li>}</ol>
          </div>
        </footer>
      )}
    </main>
  );
}

function Finale({ data, raised }: { data: StageData; raised: number }) {
  const given = data.givenMinor;
  const top = data.items.filter(i => i.currentMinor).sort((a, b) => (b.currentMinor ?? 0) - (a.currentMinor ?? 0)).slice(0, 3);
  return (
    <section className="finale">
      <span className="fin-eyebrow"><ITrophy size={22} />Bidding has closed</span>
      <h1>Thank you!</h1>
      <div className="fin-nums">
        <div><span>Raised in bids</span><b>{formatMoney(raised)}</b></div>
        {given > 0 && <div><span>Donated</span><b>{formatMoney(given)}</b></div>}
        <div><span>Bidders</span><b>{data.bidders}</b></div>
      </div>
      {top.length > 0 && <ol className="fin-top">{top.map(i => <li key={i.id}><span className="ft-img">{i.imageUrl ? <img style={photoStyle(i.imageFocal)} src={i.imageUrl} alt="" /> : <ItemArt item={i} size="sm" />}</span><span><b>{i.title}</b><small>{formatMoney(i.currentMinor!)}</small></span></li>)}</ol>}
      <p className="fin-note">Winners: check your phone. Staff will confirm and tell you how to collect.</p>
    </section>
  );
}
