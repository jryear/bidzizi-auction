"use client";
// Staff & access: invite a colleague, issue a password reset, or remove access. BidZizi doesn't send email; the host shares
// a private, one-time link that expires in 24 hours. Using it signs that person out everywhere else.
// Owners reset colleagues' passwords and remove access; everyone can invite and reset their own password.
import { useEffect, useRef, useState } from "react";
import { api, errorText } from "../../lib/api";
import { ICheck, IClose, ICopy, IUsers } from "../../lib/icons";

type Staff = { id: string; name: string; email: string; role: "owner" | "staff"; status: "active" | "invited" | "deactivated" };
type You = { id: string; role: "owner" | "staff" };

export function StaffDialog({ me, onClose }: { me?: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [staff, setStaff] = useState<Staff[] | null>(null), [you, setYou] = useState<You | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  const [link, setLink] = useState<{ for: string; url: string } | null>(null), [copied, setCopied] = useState(false);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); load(); }, []);

  async function load() {
    const r = await api<{ staff: Staff[]; you: You }>("GET", "/api/v1/host/staff").catch(() => null);
    if (r?.ok) { setStaff(r.data.staff); setYou(r.data.you); } else setError(r ? errorText(r) : "Connection lost. Try again.");
  }
  async function issue(path: string, body: object, who: string) {
    setBusy(true); setError(""); setLink(null); setCopied(false);
    const r = await api("POST", path, body).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setError(r ? errorText(r) : "Connection lost. Try again."); return false; }
    const url = new URL(r.data.setupUrl, location.origin).href;
    setLink({ for: who, url }); await load(); return true;
  }
  async function remove(s: Staff) {
    setBusy(true); setError(""); setLink(null);
    const r = await api("POST", `/api/v1/host/staff/${s.id}/deactivate`, {}).catch(() => null);
    setBusy(false); setRemoving(null);
    if (!r?.ok) { setError(r ? errorText(r) : "Connection lost. Try again."); return; }
    await load();
  }
  async function copy() {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.url); setCopied(true); } catch { setError("Select the link above and copy it."); }
  }

  return (
    <dialog ref={ref} className="sx-dialog staff-dlg" aria-labelledby="staff-title" onClose={onClose}>
      <button type="button" className="sx-icon-btn dlg-x" aria-label="Close" onClick={() => ref.current?.close()}><IClose size={22} /></button>
      <div className="staff-body">
        <span className="staff-ic"><IUsers size={22} /></span>
        <h2 id="staff-title">Staff &amp; access</h2>
        <p className="sx-muted">Invite a colleague, or help someone who forgot their password. You&rsquo;ll get a private link to send them yourself.{you && you.role !== "owner" ? " Only an owner can reset a colleague\u2019s password or remove access." : ""}</p>

        <div className="staff-head"><h3>Your team</h3><button type="button" className="sx-btn ghost sm" onClick={load}>Refresh staff</button></div>
        <ul className="staff-list">
          {!staff && <li className="sx-muted">Loading…</li>}
          {staff?.map(s => {
            const self = s.id === you?.id, owner = you?.role === "owner";
            const sub = s.status === "invited" ? " · invited, not set up yet" : s.status === "deactivated" ? " · access removed" : "";
            return (
              <li key={s.id} className={`staff-row${s.status === "deactivated" ? " off" : ""}`}>
                <span className="pp-mark">{s.name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase()}</span>
                <span className="pp-t"><b>{s.name}{self ? " (you)" : ""}{s.role === "owner" ? <em className="staff-role">Owner</em> : null}</b><small>{s.email}{sub}</small></span>
                {removing === s.id ? (
                  <span className="staff-confirm" role="group" aria-label={`Remove access for ${s.name}`}>
                    <small>Sign {s.name.split(/\s+/)[0]} out everywhere now?</small>
                    <button type="button" className="sx-btn danger sm" disabled={busy} onClick={() => remove(s)}>Remove access</button>
                    <button type="button" className="sx-btn ghost sm" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button>
                  </span>
                ) : (self || owner) && (
                  <span className="staff-acts">
                    <button type="button" className="sx-btn ghost sm" disabled={busy} onClick={() => issue(`/api/v1/host/staff/${s.id}/password-reset`, {}, s.name)}>
                      {s.status === "active" ? "Reset password" : s.status === "invited" ? "New invite link" : "Restore access"}
                    </button>
                    {owner && !self && s.status !== "deactivated" && <button type="button" className="sx-btn ghost sm" disabled={busy} onClick={() => { setRemoving(s.id); setLink(null); }}>Remove</button>}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {link && (
          <div className="staff-link" role="status">
            <b>One-time link for {link.for}</b>
            <p>Send it privately. It works once and expires in 24 hours.</p>
            <div className="sl-row">
              <input aria-label="One-time setup link" readOnly value={link.url} onFocus={e => e.target.select()} />
              <button type="button" className="sx-btn primary sm" onClick={copy}>{copied ? <><ICheck size={16} />Copied</> : <><ICopy size={16} />Copy link</>}</button>
            </div>
          </div>
        )}

        <form className="staff-invite" onSubmit={async e => { e.preventDefault(); if (await issue("/api/v1/host/staff/invites", { name, email }, name)) { setName(""); setEmail(""); } }}>
          <h3>Invite a colleague</h3>
          <div className="si-row">
            <label className="sx-field"><span className="sx-label">Colleague&rsquo;s name</span><input required maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
            <label className="sx-field"><span className="sx-label">Email</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          </div>
          <button className="sx-btn" disabled={busy}>Create invite</button>
        </form>
        {error && <p className="sx-error" role="alert">{error}</p>}
      </div>
    </dialog>
  );
}
