"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtTime } from "../../lib/api";
import { ICalendar, IChevR, ICopy, IEye, IMonitor, IPlus, ISignOut } from "../../lib/icons";
import { countdown } from "../e/[code]/model";
import { currentEvent, type EventCard } from "./data";
import { Brand, Login, Menu, Status } from "./kit";
import { NewEvent } from "./new-event";
import "../e/[code]/participant.css";
import "./studio.css";

export default function StudioHome() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "signedout" | "ready" | "error">("loading");
  const [events, setEvents] = useState<EventCard[]>([]);
  const [staff, setStaff] = useState<{ name: string; orgName: string } | null>(null);
  const [serverNow, setServerNow] = useState(Date.now());
  const [creating, setCreating] = useState<null | { from?: EventCard }>(null);
  const [showAll, setShowAll] = useState(false);
  const load = useCallback(async () => {
    const r = await api("GET", "/api/v1/host/events").catch(() => null);
    if (!r) { setState(s => s === "ready" ? s : "error"); return; }
    if (r.status === 401) { setState("signedout"); return; }
    setEvents(r.data.events); setServerNow(new Date(r.data.serverNow).getTime());
    const m = await api("GET", "/api/v1/host/me").catch(() => null);
    if (m?.ok) setStaff(m.data.staff);
    setState("ready");
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 15_000); return () => clearInterval(t); }, [load]);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(t); }, []);

  if (state === "loading") return <main className="sx sx-center"><div className="sx-loading"><Brand /><span className="dots"><i /><i /><i /></span></div></main>;
  if (state === "signedout") return <Login onIn={load} />;
  if (state === "error") return <main className="sx sx-center"><div className="sx-loading"><Brand /><p>Can&rsquo;t reach BidZizi right now. Retrying…</p><button className="sx-btn" onClick={load}>Try again</button></div></main>;

  const now = serverNow + tick * 1000;
  const current = currentEvent(events, now);
  const rest = events.filter(e => e.id !== current?.id);
  const drafts = rest.filter(e => e.stage === "draft"), others = rest.filter(e => e.stage !== "draft");
  const archive = [...others, ...drafts];
  const shown = showAll ? archive : archive.slice(0, 5);

  return (
    <main className="sx sx-home">
      <header className="sx-top home">
        <Brand />
        <span className="org">{staff?.orgName}</span>
        <span className="grow" />
        <button type="button" className="sx-btn" onClick={() => setCreating({})}><IPlus size={18} />New event</button>
        <Menu label="Account">
          <span className="pop-head">{staff?.name}<small>{staff?.orgName}</small></span>
          <button type="button" role="menuitem" onClick={async () => { await api("POST", "/api/v1/host/logout", {}); setState("signedout"); }}><ISignOut size={18} />Sign out</button>
        </Menu>
      </header>

      <div className="home-wrap">
        {current ? <Hero e={current} now={now} onOpen={id => router.push(`/studio/${id}`)} /> : (
          <section className="hero-empty">
            <div><h1>Host your first auction</h1>
              <p>Pick a template, edit it on the phone your guests will see, then share one code.</p>
              <button type="button" className="sx-btn primary lg" onClick={() => setCreating({})}><IPlus size={20} />Start an event</button></div>
            <div className="he-phones" aria-hidden="true"><span className="he-p p1" /><span className="he-p p2" /><span className="he-p p3" /></div>
          </section>
        )}

        {current && archive.length > 0 && (
          <div className="home-grid">
              <section className="archive">
                <div className="ar-head"><h2>Other events</h2></div>
                <ul>
                  {shown.map(e => (
                    <li key={e.id} className="ar-row">
                      <a href={`/studio/${e.id}`} className="ar-main">
                        <span className="ar-thumb">{e.coverUrl ? <img src={e.coverUrl} alt="" /> : <span>{e.name.slice(0, 1)}</span>}</span>
                        <span className="ar-t"><b>{e.name}</b><small>{fmtTime(e.startsAt)} · {e.itemCount} item{e.itemCount === 1 ? "" : "s"}{e.participantCount ? ` · ${e.participantCount} joined` : ""}</small></span>
                        <Status stage={e.stage} />
                      </a>
                      <button type="button" className="sx-btn ghost sm ar-dup" onClick={() => setCreating({ from: e })} title="New draft with this event's setup and items" aria-label={`Start from this: ${e.name}`}><ICopy size={16} /><span className="ar-dup-l">Start from this</span></button>
                    </li>
                  ))}
                </ul>
                {archive.length > 5 && <button type="button" className="sx-btn ghost" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${archive.length}`}</button>}
              </section>
          </div>
        )}
      </div>
      {creating && <NewEvent events={events} startWith={creating.from} onClose={() => setCreating(null)} onCreated={id => router.push(`/studio/${id}`)} />}
    </main>
  );
}

function Hero({ e, now, onOpen }: { e: EventCard; now: number; onOpen: (id: string) => void }) {
  const t = (s: string) => new Date(s).getTime();
  const when = e.stage === "running" ? { label: "Bidding ends in", value: countdown(e.endsAt, now) }
    : e.stage === "upcoming" ? { label: "Bidding opens in", value: countdown(e.startsAt, now) }
    : e.stage === "draft" ? (t(e.startsAt) > now ? { label: "Starts in", value: countdown(e.startsAt, now) } : { label: "Draft", value: "Not live" })
    : { label: "Ended", value: new Date(e.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  const primary = {
    draft: { label: "Continue setting up", href: `/studio/${e.id}` },
    upcoming: { label: "Open", href: `/studio/${e.id}` },
    running: { label: "Run it live", href: `/studio/${e.id}?mode=live` },
    ended: { label: "Wrap up", href: `/studio/${e.id}?mode=results` },
  }[e.stage];
  return (
    <section className={`hero s-${e.stage}`}>
      <div className="hero-media">{e.coverUrl ? <img src={e.coverUrl} alt="" /> : <span className="hero-art">{e.name.slice(0, 1)}</span>}</div>
      <div className="hero-body">
        <div className="hero-top"><Status stage={e.stage} big />{e.status === "live" && <span className="hero-code">Code <b>{e.code}</b></span>}</div>
        <h1>{e.name}</h1>
        <p className="hero-date"><ICalendar size={18} />{fmtTime(e.startsAt)} – {new Date(e.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
        <div className="hero-stats">
          <div className="hs-when"><span>{when.label}</span><b>{when.value}</b></div>
          {e.stage === "draft" || e.stage === "upcoming" ? <div><span>Items</span><b>{e.itemCount}</b></div> : <>
            <div><span>Joined</span><b>{e.participantCount}</b></div>
            <div><span>Bids</span><b>{e.bidCount}</b></div></>}
        </div>
        <div className="hero-acts">
          <a className="sx-btn primary lg" href={primary.href} onClick={ev => { ev.preventDefault(); onOpen(primary.href.replace("/studio/", "")); }}>{primary.label}<IChevR size={18} /></a>
          {e.stage === "running"
            ? <a className="sx-btn on-dark lg" href={`/studio/${e.id}/stage`} target="_blank"><IMonitor size={18} />Stage display</a>
            : <a className="sx-btn on-dark lg" href={`/e/${e.code}`} target="_blank"><IEye size={18} />Preview</a>}
        </div>
      </div>
    </section>
  );
}
