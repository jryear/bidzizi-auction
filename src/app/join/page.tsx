"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Offline } from "../../lib/api";
import "../e/[code]/participant.css";

const clean = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

export default function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function go(event?: React.FormEvent, value = code) {
    event?.preventDefault();
    if (value.length !== 6) { setError("Event codes are 6 characters."); return; }
    setBusy(true); setError("");
    try {
      const r = await api("GET", `/api/v1/e/${value}`);
      if (r.ok) router.push(`/e/${value}`);
      else setError(r.status === 404 ? "We couldn't find that event. Check the code with your host." : "Something went wrong. Try again.");
    } catch (e) { setError(e instanceof Offline ? "You're offline. Connect and try again." : "Something went wrong."); }
    finally { setBusy(false); }
  }
  return (
    <main className="pa pa-center join-code">
      <form className="jc" onSubmit={go}>
        <span className="pa-brand">Bid<i>Zizi</i></span>
        <h1>Join an event</h1>
        <p className="muted">Scan the QR code at the event, or type the code your host shows.</p>
        <label className={`cells${focused ? " focus" : ""}${error ? " bad" : ""}`} onClick={() => input.current?.focus()}>
          <span className="sr">Event code</span>
          <input ref={input} value={code} aria-label="Event code" inputMode="text" autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false} autoFocus
            onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            onChange={e => { const v = clean(e.target.value); setCode(v); setError(""); if (v.length === 6) go(undefined, v); }} />
          {Array.from({ length: 6 }, (_, i) => <span key={i} className={`cell${i === code.length && focused ? " cur" : ""}${code[i] ? " on" : ""}`} aria-hidden="true">{code[i] ?? ""}</span>)}
        </label>
        {error && <p className="notice-err" role="alert">{error}</p>}
        <button className="btn primary block lg" disabled={busy || code.length !== 6}>{busy ? <><span className="spinner" aria-hidden="true" />Finding your event…</> : "Join"}</button>
        <p className="fine center">Hosting an event? <a href="/studio">Staff sign in</a></p>
      </form>
    </main>
  );
}
