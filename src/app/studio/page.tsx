"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText, fmtTime, newId } from "../../lib/api";
import { TEMPLATES, THEMES, type Template } from "../../lib/templates";
import "./studio-design.css";
import { StaffTeam } from "./staff-team";
import { Login, StageChip } from "../host/ui";

type EventCard = { id: string; name: string; code: string; stage: string; startsAt: string; coverUrl: string | null; itemCount: number; participantCount: number; bidCount: number; isPractice: boolean; archivedAt: string | null };

export default function StudioHome() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "signedout" | "ready">("loading");
  const [events, setEvents] = useState<EventCard[]>([]);
  const [org, setOrg] = useState("");
  const [creating, setCreating] = useState(false);
  const [shelfExpanded,setShelfExpanded]=useState(false);
  const [team, setTeam] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Template | null>(null);
  const load = useCallback(async () => {
    const r = await api("GET", "/api/v1/host/events").catch(() => null);
    if (!r) { setError("Connection lost. Try again."); return; }
    if (!r.ok && r.status !== 401) { setError(errorText(r)); return; }
    setError("");
    if (r.status === 401) { setState("signedout"); return; }
    setEvents(r.data.events);
    const m = await api("GET", "/api/v1/host/me").catch(() => null);
    if (m?.ok) setOrg(m.data.staff.orgName);
    setState("ready");
  }, []);
  useEffect(() => { load(); }, [load]);
  if (state === "loading") return <main className="studio-home"><p className="muted" style={{ padding: 32 }}>{error || "Loading…"}</p>{error && <button className="btn" onClick={load}>Retry</button>}</main>;
  if (state === "signedout") return <Login onIn={load} />;
  const active = events.filter(e => !e.archivedAt && !["closed", "ended"].includes(e.stage));
  const current = [...active].sort((a, b) => (a.isPractice ? 1 : 0) - (b.isPractice ? 1 : 0) || (Number(["open","running"].includes(b.stage))-Number(["open","running"].includes(a.stage))) || Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  const archive = events.filter(e => e.id !== current?.id);
  return (
    <main className="studio-home">
      <header className="host-top"><a className="brand" href="/studio">Bid<i>Zizi</i></a><span className="studio-label">STUDIO</span><span className="grow" /><span className="small muted">{org}</span><button className="btn small" onClick={() => setTeam(!team)}>Staff & access</button><button className="btn small ghost" onClick={async () => { await api("POST", "/api/v1/host/logout", {}); setState("signedout"); }}>Sign out</button></header>
      <div className="host-main">
        <div className="home-intro"><div><p className="eyebrow">{org} · your event room</p><h1>Welcome to Studio.</h1><p className="muted">A great event starts here. Make it yours, then bring everyone in.</p></div><button className="btn primary" onClick={() => setCreating(!creating)}>+ New event</button></div>
        {error && <p className="notice error" role="alert">{error}</p>}
        {team && <StaffTeam />}
        {current ? <section className="current-event card">
          <a className="current-art" href={`/studio/${current.id}`}>{current.coverUrl ? <img src={current.coverUrl} alt="" /> : <div className="event-art"><span>YOU’RE THE HOST</span><b>{org}</b><span>Good things happen together.</span></div>}</a>
          <div className="current-copy"><p className="eyebrow">Your current event {current.isPractice ? "· Practice" : ""}</p><StageChip stage={current.stage} /><h2><a href={`/studio/${current.id}`}>{current.name}</a></h2><p className="muted">{fmtTime(current.startsAt)}</p><div className="event-numbers"><span><b>{current.itemCount}</b> items</span><span><b>{current.participantCount}</b> joined</span><span><b>{current.bidCount}</b> bids</span></div><a className="btn primary" href={`/studio/${current.id}`}>{current.stage === "draft" ? "Keep setting up" : "Open your event"} →</a><p className="small muted">Join code <b>{current.code}</b></p></div>
        </section> : <section className="current-event card empty-home"><div className="event-art"><span>THE ROOM IS YOURS</span><b>Let’s bring<br />people together.</b></div><div className="current-copy"><h2>Your next event starts here.</h2><p className="muted">Choose a starting point, add your items and welcome your guests. Practice first if you like.</p><button className="btn primary" onClick={() => setCreating(true)}>Create an event →</button></div></section>}
        {creating && <section className="stack template-flow"><div className="row between"><div><p className="eyebrow">New event</p><h2>Choose a starting point</h2></div><button className="btn ghost small" onClick={() => setCreating(false)}>Close</button></div><div className="templates">{TEMPLATES.map(t => { const theme = THEMES.find(x => x.id === t.theme)!; return <button key={t.id} className="template" onClick={() => setPicked(t)}><span className="template-art" style={{ background: theme.paper }}><span className="mini-pass" style={{ background: theme.ink }}><i style={{ background: theme.accent }} /></span>{t.items.slice(0,3).map(i => <span key={i.title} className="mini-lot"><b>{i.title}</b><em>${i.openingMinor/100}</em></span>)}{!t.items.length && <span className="mini-empty">+</span>}</span><b>{t.name}</b><span className="small muted">{t.blurb}</span></button>; })}</div></section>}
        {!!archive.length && <section className="stack event-archive"><div><p className="eyebrow">Your event shelf</p><h2>Past events & other drafts</h2><p className="small muted">Return to an event, or use its setup for the next one.</p></div>{(shelfExpanded?archive:archive.slice(0,3)).map(e => <div key={e.id} className="archive-row"><span className="archive-thumb">{e.coverUrl ? <img src={e.coverUrl} alt="" /> : <b>{e.code.slice(0,2)}</b>}</span><div className="grow"><a href={`/studio/${e.id}`}><b>{e.name}</b></a><p className="small muted">{fmtTime(e.startsAt)} · {e.itemCount} items {e.isPractice && "· Practice"} {e.archivedAt && "· Archived"}</p></div><StageChip stage={e.stage} /><a className="btn small" href={`/studio/${e.id}`}>Open</a><UseAgain event={e} onDone={id => router.push(`/studio/${id}`)} /></div>)}{archive.length>3&&<button className="btn small" onClick={()=>setShelfExpanded(!shelfExpanded)}>{shelfExpanded?"Show fewer events":`Show all ${archive.length} events`}</button>}</section>}
      </div>
      {picked && <CreateDialog template={picked} onClose={() => setPicked(null)} onCreated={id => router.push(`/studio/${id}`)} />}
    </main>
  );
}

function UseAgain({ event, onDone }: { event: EventCard; onDone: (id: string) => void }) {
  const request = useRef(newId());
  const [busy, setBusy] = useState(false);
  return <button className="btn small ghost" disabled={busy} onClick={async () => {
    setBusy(true);
    const r = await api("POST", `/api/v1/host/events/${event.id}/duplicate`, { requestId: request.current }).catch(() => null);
    if (r?.ok) onDone(r.data.id); else setBusy(false);
  }}>Use as template</button>;
}

/** Next round hour, as a datetime-local value in the browser's zone. */
function nextHour(offsetHours: number) {
  const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1 + offsetHours);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function CreateDialog({ template, onClose, onCreated }: { template: Template; onClose: () => void; onCreated: (id: string) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const request = useRef(newId());
  const [name, setName] = useState(template.id === "blank" ? "" : template.name);
  const [isPractice, setPractice] = useState(false);
  const [start, setStart] = useState(nextHour(24)), [end, setEnd] = useState(nextHour(24 + template.durationHours));
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Give your event a name."); return; }
    const startsAt = new Date(start).toISOString(), endsAt = new Date(end).toISOString();
    if (endsAt <= startsAt) { setError("The end must be after the start."); return; }
    setBusy(true); setError("");
    const r = await api("POST", "/api/v1/host/events", { requestId: request.current, template: template.id, name, startsAt, endsAt, isPractice,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }).catch(() => null);
    if (r?.ok) onCreated(r.data.id); else { setBusy(false); setError(r ? errorText(r) : "Connection lost. Try again — it won't be created twice."); }
  }
  return (
    <dialog ref={ref} className="modal" onClose={onClose}>
      <form className="stack" onSubmit={create}>
        <span className="small faint">{template.name}</span>
        <h2>Name your event</h2>
        <label className="field"><span className="sr">Event name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Holiday Trade Show" autoFocus /></label>
        <div className="grid2">
          <label className="field"><span>Bidding opens</span><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="field"><span>Bidding closes</span><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={isPractice} onChange={e => setPractice(e.target.checked)} /> Practice event — reset or delete after rehearsal</label>
        {template.items.length > 0 && <p className="hint">Comes with {template.items.length} sample item{template.items.length > 1 ? "s" : ""} to edit or remove.</p>}
        {error && <p className="notice error">{error}</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create & edit"}</button>
        </div>
      </form>
    </dialog>
  );
}
