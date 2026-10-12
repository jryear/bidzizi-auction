"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, errorText, fmtTime, fromLocalInput, newId, Offline } from "../../lib/api";
import { StageChip } from "./ui";

type EventCard = { id: string; name: string; code: string; status: string; stage: "draft" | "upcoming" | "running" | "ended"; startsAt: string; endsAt: string;
  coverUrl: string | null; itemCount: number; participantCount: number; bidCount: number };

export default function HostHome() {
  const [state, setState] = useState<"loading" | "signedout" | "ready">("loading");
  const [staff, setStaff] = useState<{ name: string; orgName: string } | null>(null);
  const [events, setEvents] = useState<EventCard[]>([]);
  const load = useCallback(async () => {
    try {
      const r = await api("GET", "/api/v1/host/events");
      if (r.status === 401) { setState("signedout"); return; }
      if (r.ok) {
        setEvents(r.data.events);
        const m = await api("GET", "/api/v1/host/me");
        if (m.ok) setStaff(m.data.staff);
        setState("ready");
      }
    } catch { /* keep current view */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  if (state === "loading") return <main className="host"><div className="host-main"><p className="muted">Loading…</p></div></main>;
  if (state === "signedout") return <Login onIn={load} />;
  return (
    <main className="host">
      <header className="host-top">
        <a className="brand" href="/host">Bid<i>Zizi</i></a>
        <span className="muted small">{staff?.orgName}</span>
        <span className="grow" />
        <span className="small muted">{staff?.name}</span>
        <button className="btn small" onClick={async () => { await api("POST", "/api/v1/host/logout", {}); setState("signedout"); }}>Sign out</button>
      </header>
      <div className="host-main">
        <div className="row between wrap">
          <h1>Your events</h1>
          <NewEvent />
        </div>
        {!events.length && <div className="card pad stack" style={{ alignItems: "flex-start" }}><h2>Set up your first event</h2><p className="muted">Name it, pick when it happens, add items, then share the QR code.</p></div>}
        <div className="events-grid">
          {events.map(e => (
            <a key={e.id} href={`/host/${e.id}`} className="card event-card">
              <div className="cover">{e.coverUrl && <img src={e.coverUrl} alt="" />}</div>
              <div className="pad stack" style={{ gap: 6 }}>
                <div className="row between"><StageChip stage={e.stage} /><span className="small faint">Code {e.code}</span></div>
                <h3>{e.name}</h3>
                <p className="small muted">{fmtTime(e.startsAt)}</p>
                <p className="small faint">{e.itemCount} items · {e.participantCount} joined · {e.bidCount} bids</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </main>
  );
}

function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const r = await api("POST", "/api/v1/host/login", { email, password });
      if (r.ok) onIn(); else setError(errorText(r));
    } catch (e) { setError(e instanceof Offline ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  return (
    <main className="phone">
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="join-hero"><span className="brand">Bid<i>Zizi</i></span><h1>Host sign in</h1></div>
        <form className="card pad stack" onSubmit={submit}>
          <label className="field"><span>Email</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label className="field"><span>Password</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          {error && <p className="notice error" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>
        <p className="small faint" style={{ textAlign: "center" }}>Joining an event? <a href="/join">Enter a code</a></p>
      </div>
    </main>
  );
}

function NewEvent() {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  const [name, setName] = useState(""), [start, setStart] = useState(""), [end, setEnd] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const request = useRef(newId());
  async function create(event: React.FormEvent) {
    event.preventDefault();
    const startsAt = fromLocalInput(start, tz), endsAt = fromLocalInput(end, tz);
    if (!name.trim() || !startsAt || !endsAt) { setError("Add a name, start and end."); return; }
    if (endsAt <= startsAt) { setError("The end must be after the start."); return; }
    setBusy(true); setError("");
    try {
      const r = await api("POST", "/api/v1/host/events", { requestId: request.current, name, startsAt, endsAt, timezone: tz });
      if (r.ok) router.push(`/host/${r.data.id}`); else setError(errorText(r));
    } catch { setError("Connection lost. Try again — it won't be created twice."); }
    finally { setBusy(false); }
  }
  return (
    <>
      <button className="btn primary" onClick={() => dialog.current?.showModal()}>New event</button>
      <dialog ref={dialog} className="modal">
        <form className="stack" onSubmit={create}>
          <h2>Set up your event</h2>
          <label className="field"><span>Event name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Holiday Trade Show" autoFocus /></label>
          <div className="grid2">
            <label className="field"><span>Bidding opens</span><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label>
            <label className="field"><span>Bidding closes</span><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label>
          </div>
          <p className="hint">Times are in {tz}. You can change everything later.</p>
          {error && <p className="notice error">{error}</p>}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => dialog.current?.close()}>Cancel</button>
            <button className="btn primary" disabled={busy}>{busy ? "Creating…" : "Create event"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
