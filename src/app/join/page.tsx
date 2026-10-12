"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Offline } from "../../lib/api";

export default function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function go(event: React.FormEvent) {
    event.preventDefault();
    const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length !== 6) { setError("Event codes are 6 characters."); return; }
    setBusy(true); setError("");
    try {
      const r = await api("GET", `/api/v1/e/${clean}`);
      if (r.ok) router.push(`/e/${clean}`);
      else setError(r.status === 404 ? "We couldn't find that event. Check the code and try again." : "Something went wrong. Try again.");
    } catch (e) { setError(e instanceof Offline ? e.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  return (
    <main className="phone">
      <div className="screen" style={{ justifyContent: "center" }}>
        <div className="join-hero">
          <span className="brand">Bid<i>Zizi</i></span>
          <h1>Join an event</h1>
          <p className="muted">Scan the event QR code, or enter the code shown by the host.</p>
        </div>
        <form className="stack" onSubmit={go}>
          <label className="field"><span className="sr">Event code</span>
            <input className="code-input" value={code} onChange={e => setCode(e.target.value.slice(0, 8))} placeholder="ABC123"
              autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text" aria-label="Event code" autoFocus />
          </label>
          {error && <p className="notice error" role="alert">{error}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? "Finding event…" : "Join"}</button>
        </form>
        <p className="small faint" style={{ textAlign: "center", marginTop: 24 }}>Hosting an event? <a href="/studio">Staff sign in</a></p>
      </div>
    </main>
  );
}
