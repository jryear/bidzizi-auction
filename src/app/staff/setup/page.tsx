"use client";
// Redeems a one-time staff link (invite or password reset). The token arrives in the URL fragment so it never reaches
// server logs, and is cleared from the address bar as soon as it's read.
import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../../../lib/api";
import { IAlert, ICheck, IEye, IEyeOff } from "../../../lib/icons";
import { Brand } from "../../studio/kit";
import "../../e/[code]/participant.css";
import "../../studio/studio.css";

export default function StaffSetup() {
  const [token, setToken] = useState(""), [password, setPassword] = useState(""), [show, setShow] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [read, setRead] = useState(false);
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current) return; captured.current = true;
    setToken(new URLSearchParams(location.hash.slice(1)).get("token") ?? ""); setRead(true);
    history.replaceState(null, "", location.pathname);
  }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    const r = await api("POST", "/api/v1/host/password/set", { token, password }).catch(() => null);
    setBusy(false);
    if (r?.ok) setDone(true); else setError(r ? errorText(r) : "Connection lost. Try again.");
  }
  return (
    <main className="sx sx-login">
      <section className="login-art" aria-hidden="true"><p className="la-quote">Run the room.</p></section>
      <section className="login-panel">
        {done ? (
          <div className="login-form">
            <Brand />
            <span className="setup-ok"><ICheck size={26} /></span>
            <h1>You&rsquo;re ready to host.</h1>
            <p className="sx-muted">Your password is saved, and any other sessions on this account were signed out.</p>
            <a className="sx-btn primary lg block" href="/studio">Sign in</a>
          </div>
        ) : (
          <form className="login-form" onSubmit={save}>
            <Brand />
            <h1>Set your password</h1>
            <p className="sx-muted">A colleague shared this one-time link with you. Choose a password of at least 12 characters.</p>
            {read && !token && (
              <div className="login-err" role="alert"><IAlert size={20} /><div><b>This link is incomplete</b><span>Open the full link your colleague sent. If it has expired, ask them for a new one.</span></div></div>
            )}
            {error && <div className="login-err" role="alert"><IAlert size={20} /><div><b>That didn&rsquo;t work</b><span>{error}</span></div></div>}
            <div className="sx-field"><label className="sx-label" htmlFor="new-pw">New password</label>
              <span className="pw-wrap">
                <input id="new-pw" type={show ? "text" : "password"} required minLength={12} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
                <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>{show ? <IEyeOff size={18} /> : <IEye size={18} />}</button>
              </span>
              <span className="sx-hint">{password.length >= 12 ? "Long enough." : `${12 - password.length} more character${12 - password.length === 1 ? "" : "s"}.`}</span></div>
            <button className="sx-btn primary lg block" disabled={busy || !token || password.length < 12}>{busy ? "Saving…" : "Save password"}</button>
          </form>
        )}
      </section>
    </main>
  );
}
