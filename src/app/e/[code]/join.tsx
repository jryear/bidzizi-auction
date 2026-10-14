"use client";
import { photoStyle } from "../../../lib/photo";
import { accentVars } from "../../../lib/color";
import { useState, type ReactNode } from "react";
import { api, errorText, initials, newId, Offline } from "../../../lib/api";
import { IChevL, IEye } from "../../../lib/icons";
import type { Snapshot } from "./model";
import { EventClock } from "./catalog";
import { Ed, EventHero, Facts, ItemCard, SponsorGrid, useEdit } from "./ui";

export function PreviewBanner() {
  return <div className="preview-banner" role="status"><IEye size={18} /><span><b>Preview.</b> Only staff can see this draft.</span></div>;
}

export function Join({ snap, code, onJoined, preview, readOnly = false }: { snap: Snapshot; code: string; onJoined: () => Promise<boolean> | void; preview: ReactNode; readOnly?: boolean }) {
  const edit = useEdit();
  const key = `bz_join_${code}`;
  const [name, setName] = useState(""), [business, setBusiness] = useState("");
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [rejoin, setRejoin] = useState(false), [rejoinCode, setRejoinCode] = useState("");
  const e = snap.event;
  const isPreview = Boolean(snap.preview);
  const now = new Date(snap.serverNow).getTime();

  async function join(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    if (!name.trim() || !business.trim()) { setError(!name.trim() ? "Add your name." : "Add your business name."); return; }
    setBusy(true); setError("");
    // Reuse the same request id if a previous attempt's response was lost.
    let requestId = newId();
    try { requestId = sessionStorage.getItem(key) ?? requestId; sessionStorage.setItem(key, requestId); } catch { /* ignore */ }
    try {
      const r = await api("POST", `/api/v1/e/${code}/join`, { requestId, displayName: name, businessName: business });
      if (r.ok) { try { sessionStorage.removeItem(key); } catch { /* ignore */ } await onJoined(); }
      else { setError(errorText(r)); if (r.status !== 503) try { sessionStorage.removeItem(key); } catch { /* ignore */ } }
    } catch (x) { setError(x instanceof Offline ? "Connection lost. Tap Join again — you won’t be added twice." : "Something went wrong. Try again."); }
    finally { setBusy(false); }
  }
  async function useRejoin(event: React.FormEvent) {
    event.preventDefault(); if (readOnly) return; setBusy(true); setError("");
    try {
      const r = await api("POST", `/api/v1/e/${code}/rejoin`, { code: rejoinCode });
      if (r.ok) await onJoined(); else setError(errorText(r));
    } catch { setError("Connection lost. Tap Continue again."); }
    finally { setBusy(false); }
  }

  const photos = snap.items.filter(i => i.imageUrl).slice(0, 3);
  return (
    <div className={`pa join${readOnly ? " is-canvas" : ""}`} data-guest-shell data-theme={e.theme} style={accentVars(e.accentColor)}>
      {preview}
      <div className="join-grid" data-guest-screen="join">
        <div className="j-hero">
          <EventHero event={e} eyebrow={e.venue ? `${e.venue}` : "You're invited"}>
            <p className="ehero-clock"><EventClock snap={snap} now={now} /></p>
          </EventHero>
          {!e.coverUrl && photos.length >= 2 && <div className="fan" aria-hidden="true">{photos.map(p => <img key={p.id} style={photoStyle(p.imageFocal)} src={p.imageUrl!} alt="" />)}</div>}
        </div>
        <div className="join-panel">
          <div className="join-intro">
            <Facts event={e} items={snap.items.length} />
            {(e.welcome || edit) && <Ed k="event" field="welcome" value={e.welcome} as="p" className="lead" multiline placeholder="Write a welcome" max={5000} />}
          </div>
          {isPreview ? (
            <div className="join-card disabled">
              <h2>Joining opens when you go live</h2>
              <p className="muted">Guests enter their name and business here.</p>
            </div>
          ) : !e.entryOpen ? (
            <div className="join-card"><h2>Joining is closed</h2><p className="muted">Joined on another phone? Ask staff for a rejoin code.</p>
              {!rejoin && <button type="button" className="btn quiet" onClick={() => setRejoin(true)}>I have a rejoin code</button>}
              {rejoin && <RejoinForm code={rejoinCode} setCode={setRejoinCode} onSubmit={useRejoin} busy={busy} error={error} onBack={() => setRejoin(false)} />}
            </div>
          ) : !rejoin ? (
            <form className="join-card" onSubmit={join} noValidate>
              <h2>Join the auction</h2>
              <div className={`pass-preview${business ? " filled" : ""}`} aria-hidden="true">
                <span className="pp-clip" />
                <span className="mark ci you" style={{ "--s": "52px" } as React.CSSProperties}>{business ? initials(business) : "?"}</span>
                <span className="pp-text"><b>{business || "Your business"}</b><small>{name || "Your name"}</small></span>
                <span className="pp-ev">{e.code}</span>
              </div>
              <label className="pa-field"><span>Your name</span><input value={name} onChange={x => { setName(x.target.value); setError(""); }} aria-invalid={error === "Add your name." || undefined} maxLength={60} autoComplete="name" placeholder="Alex Rivera" enterKeyHint="next" /></label>
              <label className="pa-field"><span>Business name</span><input value={business} onChange={x => { setBusiness(x.target.value); setError(""); }} aria-invalid={error === "Add your business name." || undefined} maxLength={120} autoComplete="organization" placeholder="Rivera Design Co." enterKeyHint="go" /></label>
              <p className="pa-hint">Shown next to your bids. This phone remembers you.</p>
              {error && <p className="notice-err" role="alert">{error}</p>}
              <button className="btn primary block lg" disabled={busy}>{busy ? <><span className="spinner" aria-hidden="true" />Joining…</> : "Join"}</button>
              <button type="button" className="btn-link" onClick={() => { setRejoin(true); setError(""); }}>Joined on another phone?</button>
            </form>
          ) : (
            <div className="join-card"><RejoinForm code={rejoinCode} setCode={setRejoinCode} onSubmit={useRejoin} busy={busy} error={error} onBack={() => { setRejoin(false); setError(""); }} /></div>
          )}
          <SponsorGrid sponsors={e.sponsors} />
        </div>
      </div>
      {isPreview && snap.items.length > 0 && (
        <section className="preview-items">
          <h2>What attendees will see</h2>
          <div className="cards">{snap.items.map(i => <ItemCard key={i.id} item={i} now={now} canWatch={false} />)}</div>
        </section>
      )}
    </div>
  );
}

function RejoinForm({ code, setCode, onSubmit, busy, error, onBack }: { code: string; setCode: (v: string) => void; onSubmit: (e: React.FormEvent) => void; busy: boolean; error: string; onBack: () => void }) {
  return (
    <form className="stack-form" onSubmit={onSubmit}>
      <button type="button" className="back-link" onClick={onBack}><IChevL size={18} />Back</button>
      <h2>Continue on this phone</h2>
      <p className="muted">Ask staff for a rejoin code. Your bids move to this phone and the old one signs out.</p>
      <label className="pa-field"><span>Rejoin code</span><input className="pa-code" value={code} onChange={x => setCode(x.target.value.toUpperCase().replace(/\s/g, ""))} aria-invalid={Boolean(error) || undefined} autoFocus autoCapitalize="characters" autoComplete="one-time-code" placeholder="ABCD1234" /></label>
      {error && <p className="notice-err" role="alert">{error}</p>}
      <button className="btn primary block lg" disabled={busy || !code.trim()}>{busy ? "Checking…" : error ? "Try again" : "Continue"}</button>
    </form>
  );
}
