"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText, fmtTime, newId } from "../../lib/api";
import { TEMPLATES, THEMES, type Template } from "../../lib/templates";
import { Login, StageChip } from "../host/ui";

type EventCard = { id: string; name: string; code: string; stage: string; startsAt: string; coverUrl: string | null; itemCount: number; participantCount: number; bidCount: number };

export default function StudioHome() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "signedout" | "ready">("loading");
  const [events, setEvents] = useState<EventCard[]>([]);
  const [org, setOrg] = useState("");
  const [picked, setPicked] = useState<Template | null>(null);
  const load = useCallback(async () => {
    const r = await api("GET", "/api/v1/host/events").catch(() => null);
    if (!r) return;
    if (r.status === 401) { setState("signedout"); return; }
    setEvents(r.data.events);
    const m = await api("GET", "/api/v1/host/me").catch(() => null);
    if (m?.ok) setOrg(m.data.staff.orgName);
    setState("ready");
  }, []);
  useEffect(() => { load(); }, [load]);
  if (state === "loading") return <main className="studio-home"><p className="muted" style={{ padding: 32 }}>Loading…</p></main>;
  if (state === "signedout") return <Login onIn={load} />;
  return (
    <main className="studio-home">
      <header className="host-top">
        <a className="brand" href="/studio">Bid<i>Zizi</i></a>
        <span className="small muted">{org}</span>
        <span className="grow" />
        <button className="btn small" onClick={async () => { await api("POST", "/api/v1/host/logout", {}); setState("signedout"); }}>Sign out</button>
      </header>
      <div className="host-main">
        <section className="stack">
          <h1>Start something new</h1>
          <div className="templates">
            {TEMPLATES.map(t => {
              const theme = THEMES.find(x => x.id === t.theme)!;
              return (
                <button key={t.id} className="template" onClick={() => setPicked(t)}>
                  <span className="template-art" style={{ background: theme.paper }}>
                    <span className="mini-pass" style={{ background: theme.ink }}><i style={{ background: theme.accent }} /></span>
                    {t.items.slice(0, 3).map(i => <span key={i.title} className="mini-lot"><b>{i.title}</b><em>${i.openingMinor / 100}</em></span>)}
                    {!t.items.length && <span className="mini-empty">+</span>}
                  </span>
                  <b>{t.name}</b>
                  <span className="small muted">{t.blurb}</span>
                </button>
              );
            })}
          </div>
        </section>
        {events.length > 0 && (
          <section className="stack">
            <h2>Your events</h2>
            <div className="events-grid">
              {events.map(e => (
                <div key={e.id} className="card event-card">
                  <a href={`/studio/${e.id}`} className="cover" style={{ display: "block" }}>{e.coverUrl && <img src={e.coverUrl} alt="" />}</a>
                  <div className="pad stack" style={{ gap: 6 }}>
                    <div className="row between"><StageChip stage={e.stage} /><span className="small faint">{e.code}</span></div>
                    <a href={`/studio/${e.id}`} style={{ color: "inherit", textDecoration: "none" }}><h3>{e.name}</h3></a>
                    <p className="small muted">{fmtTime(e.startsAt)} · {e.itemCount} items · {e.participantCount} joined</p>
                    <div className="row"><a className="btn small" href={`/studio/${e.id}`}>Open</a><UseAgain event={e} onDone={id => router.push(`/studio/${id}`)} /></div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
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
  const [name, setName] = useState(template.id === "blank" ? "" : template.name.replace(" auction", ""));
  const [start, setStart] = useState(nextHour(24)), [end, setEnd] = useState(nextHour(24 + template.durationHours));
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Give your event a name."); return; }
    const startsAt = new Date(start).toISOString(), endsAt = new Date(end).toISOString();
    if (endsAt <= startsAt) { setError("The end must be after the start."); return; }
    setBusy(true); setError("");
    const r = await api("POST", "/api/v1/host/events", { requestId: request.current, template: template.id, name, startsAt, endsAt,
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
