"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, fmtTime } from "../../lib/api";
import { IArrowUp, ICalendar, IChevR, ICopy, IEye, IMonitor, IPlus, ISignOut, ITicket, IUsers } from "../../lib/icons";
import { countdown } from "../e/[code]/model";
import { currentEvent, type EventCard } from "./data";
import { THEMES } from "../../lib/templates";
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
  const hello = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

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
        <p className="hello">{hello}{staff?.name ? `, ${staff.name.split(" ")[0]}` : ""}.</p>
        {current ? <Hero e={current} now={now} onOpen={id => router.push(`/studio/${id}`)} /> : (
          <section className="hero-empty">
            <div><span className="sx-eyebrow">Welcome to BidZizi Studio</span><h1>Host your first auction</h1>
              <p>Pick a template, edit it right on the phone your guests will see, then share one code. It takes about ten minutes.</p>
              <button type="button" className="sx-btn primary lg" onClick={() => setCreating({})}><IPlus size={20} />Start an event</button></div>
            <div className="he-phones" aria-hidden="true"><span className="he-p p1" /><span className="he-p p2" /><span className="he-p p3" /></div>
          </section>
        )}

        {current && (
          <div className="home-grid">
            <button type="button" className="new-card" onClick={() => setCreating({})}>
              <span className="nc-top"><span className="nc-plus"><IPlus size={26} /></span><IChevR size={20} /></span>
              <span><b>Start a new event</b><small>From a template or a past event. It stays a draft until you go live, so practice runs are safe.</small></span>
              <span className="nc-tpls" aria-hidden="true">{THEMES.map(t => <span key={t.id} style={{ background: t.paper }}><i style={{ background: t.ink }} /><em /><em /></span>)}</span>
            </button>
            {archive.length > 0 && (
              <section className="archive">
                <div className="ar-head"><h2>Other events</h2><span className="sx-muted">{archive.length}</span></div>
                <ul>
                  {shown.map(e => (
                    <li key={e.id} className="ar-row">
                      <a href={`/studio/${e.id}`} className="ar-main">
                        <span className="ar-thumb">{e.coverUrl ? <img src={e.coverUrl} alt="" /> : <span>{e.name.slice(0, 1)}</span>}</span>
                        <span className="ar-t"><b>{e.name}</b><small>{fmtTime(e.startsAt)} · {e.itemCount} items{e.participantCount ? ` · ${e.participantCount} joined` : ""}</small></span>
                        <Status stage={e.stage} />
                      </a>
                      <button type="button" className="sx-btn ghost sm" onClick={() => setCreating({ from: e })} title="New draft with this event's setup and items"><ICopy size={16} />Start from this</button>
                    </li>
                  ))}
                </ul>
                {archive.length > 5 && <button type="button" className="sx-btn ghost" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${archive.length}`}</button>}
                {drafts.length > 2 && <p className="sx-fine">Practice drafts stay here; nobody but staff can see a draft.</p>}
              </section>
            )}
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
    : e.stage === "draft" ? (t(e.startsAt) > now ? { label: "Planned for", value: countdown(e.startsAt, now) } : { label: "Draft", value: "Not live" })
    : { label: "Ended", value: new Date(e.endsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
  const primary = {
    draft: { label: "Continue setting up", href: `/studio/${e.id}` },
    upcoming: { label: "Open Studio", href: `/studio/${e.id}` },
    running: { label: "Open live control", href: `/studio/${e.id}?mode=live` },
    ended: { label: "Wrap up results", href: `/studio/${e.id}?mode=results` },
  }[e.stage];
  return (
    <section className={`hero s-${e.stage}`}>
      <div className="hero-media">{e.coverUrl ? <img src={e.coverUrl} alt="" /> : <span className="hero-art">{e.name.slice(0, 1)}</span>}</div>
      <div className="hero-body">
        <div className="hero-top"><Status stage={e.stage} big />{e.status === "live" && <span className="hero-code">Code <b>{e.code}</b></span>}</div>
        <span className="sx-eyebrow light">{e.stage === "running" ? "Happening now" : e.stage === "ended" ? "Most recent event" : "Your next event"}</span>
        <h1>{e.name}</h1>
        <p className="hero-date"><ICalendar size={18} />{fmtTime(e.startsAt)} – {new Date(e.endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
        <div className="hero-stats">
          <div className="hs-when"><span>{when.label}</span><b>{when.value}</b></div>
          <div><span><ITicket size={15} />Items</span><b>{e.itemCount}</b></div>
          <div><span><IUsers size={15} />Joined</span><b>{e.participantCount}</b></div>
          <div><span><IArrowUp size={15} />Bids</span><b>{e.bidCount}</b></div>
        </div>
        <div className="hero-acts">
          <a className="sx-btn primary lg" href={primary.href} onClick={ev => { ev.preventDefault(); onOpen(primary.href.replace("/studio/", "")); }}>{primary.label}<IChevR size={18} /></a>
          {e.stage === "running" && <a className="sx-btn on-dark lg" href={`/studio/${e.id}/stage`} target="_blank"><IMonitor size={18} />Stage display</a>}
          <a className="sx-btn on-dark lg" href={`/e/${e.code}`} target="_blank"><IEye size={18} />{e.status === "draft" ? "Preview" : "Attendee view"}</a>
        </div>
      </div>
    </section>
  );
}
