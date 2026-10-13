"use client";
import { useEffect, useState } from "react";
import { api, errorText } from "../../lib/api";
type Staff = { id: string; name: string; email: string; active: boolean };
export function StaffTeam() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  const [link, setLink] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = async () => { const r = await api("GET", "/api/v1/host/staff").catch(() => null); if (r?.ok) setStaff(r.data.staff); else setError(r ? errorText(r) : "Connection lost."); };
  useEffect(() => { load(); }, []);
  async function issue(path: string, body: object) {
    setBusy(true); setError(""); setLink("");
    const r = await api("POST", path, body).catch(() => null);
    if (r?.ok) { const token = r.data.token; setLink(token ? `${location.origin}/staff/setup#${token}` : new URL(r.data.setupUrl, location.origin).href); await load(); }
    else setError(r ? errorText(r) : "Connection lost. Try again.");
    setBusy(false);
  }
  return <section className="card pad stack staff-team"><div><p className="eyebrow">Your team</p><div className="row between"><h2>Staff & access</h2><button className="btn small" onClick={load}>Refresh staff</button></div><p className="small muted">Invite a colleague or help them reset their password. Share the one-time link privately; BidZizi does not send an email.</p></div>
    {staff.map(s => <div className="row between wrap" key={s.id}><div><b>{s.name}</b><p className="small muted">{s.email}</p></div><button className="btn small" disabled={busy} onClick={() => issue(`/api/v1/host/staff/${s.id}/password-reset`, {})}>{s.active ? "Reset password" : "New invite link"}</button></div>)}
    <form className="row wrap" style={{alignItems:"end"}} onSubmit={e => {e.preventDefault(); issue("/api/v1/host/staff/invites", {name,email});}}><label className="field grow"><span>Colleague’s name</span><input required value={name} onChange={e=>setName(e.target.value)} /></label><label className="field grow"><span>Email</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} /></label><button disabled={busy} className="btn primary">Create invite</button></form>
    {link && <div className="notice info stack"><b>One-time password setup link</b><p className="small">Copy and share privately. The link expires in 24 hours.</p><input className="input" aria-label="One-time setup link" readOnly value={link} onFocus={e=>e.target.select()} /><button className="btn small" onClick={async()=>{try {await navigator.clipboard.writeText(link);} catch {setError("Select and copy the link above.");}}}>Copy link</button></div>}
    {error && <p className="notice error" role="alert">{error}</p>}
  </section>;
}
