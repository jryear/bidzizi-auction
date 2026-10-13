"use client";
// Studio controls. Every control is drawn here; nothing falls back to a default browser look.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { api, dollarsInput, errorText, Offline, parseDollars } from "../../lib/api";
import { qrcodegen } from "../../lib/qr-code.js";
import { IAlert, ICheck, IEye, IEyeOff, IMore, IUpload, ITrash } from "../../lib/icons";
import { uploadPhoto } from "./data";

export function Brand({ href = "/studio" }: { href?: string }) {
  return <a className="sx-brand" href={href}>Bid<i>Zizi</i><span>Studio</span></a>;
}

/** Text that saves when you leave it. Enter saves single-line fields; Escape restores. */
export function TextField({ label, value, onSave, placeholder, multiline = false, hint, disabled, max = 5000, rows = 4, autoFocus }: {
  label: string; value: string; onSave: (v: string) => void; placeholder?: string; multiline?: boolean; hint?: ReactNode; disabled?: boolean; max?: number; rows?: number; autoFocus?: boolean;
}) {
  const [v, setV] = useState(value);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setV(value); }, [value]);
  const commit = () => { editing.current = false; const next = multiline ? v : v.trim(); if (next !== value) onSave(next); };
  const common = {
    value: v, placeholder, disabled, maxLength: max, autoFocus,
    onFocus: () => { editing.current = true; },
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Escape") { setV(value); editing.current = false; (e.target as HTMLElement).blur(); }
      if (e.key === "Enter" && !multiline) (e.target as HTMLElement).blur();
    },
  };
  return (
    <label className="sx-field">
      <span className="sx-label">{label}</span>
      {multiline ? <textarea rows={rows} {...common} /> : <input {...common} />}
      {hint && <span className="sx-hint">{hint}</span>}
    </label>
  );
}

export function MoneyField({ label, minor, onSave, disabled, placeholder, hint, allowEmpty = false }: {
  label: string; minor: number | null; onSave: (v: number | null) => void; disabled?: boolean; placeholder?: string; hint?: ReactNode; allowEmpty?: boolean;
}) {
  const [v, setV] = useState(minor === null ? "" : dollarsInput(minor));
  const [bad, setBad] = useState(false);
  useEffect(() => { setV(minor === null ? "" : dollarsInput(minor)); setBad(false); }, [minor]);
  return (
    <label className={`sx-field${bad ? " bad" : ""}`}>
      <span className="sx-label">{label}</span>
      <span className="sx-money"><b>$</b><input inputMode="decimal" value={v} disabled={disabled} placeholder={placeholder}
        onChange={e => { setV(e.target.value.replace(/[^0-9.,]/g, "")); setBad(false); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLElement).blur(); }}
        onBlur={() => {
          if (!v.trim()) { if (allowEmpty) { if (minor !== null) onSave(null); } else { setV(minor === null ? "" : dollarsInput(minor)); } return; }
          const p = parseDollars(v); if (!p) { setBad(true); return; }
          if (p !== minor) onSave(p);
        }} /></span>
      {bad ? <span className="sx-hint err">Enter an amount like 150 or 150.50</span> : hint && <span className="sx-hint">{hint}</span>}
    </label>
  );
}

export function Switch({ on, onChange, label, sub, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`sx-switch${on ? " on" : ""}`} disabled={disabled} onClick={() => onChange(!on)}>
      <span className="sw-text"><b>{label}</b>{sub && <small>{sub}</small>}</span>
      <span className="sw-track" aria-hidden="true"><i /></span>
    </button>
  );
}

export function Seg<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: { id: T; label: ReactNode; badge?: number }[]; onChange: (v: T) => void; label: string; size?: "md" | "lg" }) {
  return (
    <div className={`sx-seg ${size}`} role="tablist" aria-label={label}>
      {options.map(o => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} className={value === o.id ? "on" : ""} onClick={() => onChange(o.id)}>
          {o.label}{o.badge ? <em>{o.badge}</em> : null}
        </button>
      ))}
    </div>
  );
}

/** A small popover menu. Closes on outside click and Escape. */
export function Menu({ label = "More", children, align = "right", trigger }: { label?: string; children: ReactNode; align?: "left" | "right"; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="sx-menu" ref={ref}>
      <button type="button" className="sx-icon-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}>{trigger ?? <IMore size={20} />}</button>
      {open && <div className={`sx-pop ${align}`} role="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

export function Ring({ done, total, size = 44, stroke = 5 }: { done: number; total: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, pct = total ? done / total : 0;
  return (
    <span className={`sx-ring${pct >= 1 ? " full" : ""}`} style={{ width: size, height: size } as CSSProperties} role="img" aria-label={`${done} of ${total} done`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="ring-bg" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="ring-fg" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b>{pct >= 1 ? <ICheck size={size * .42} /> : `${done}/${total}`}</b>
    </span>
  );
}

const STAGES: Record<string, [string, string]> = {
  draft: ["Draft", "draft"], upcoming: ["Live · starts soon", "upcoming"], running: ["Bidding open", "open"], ended: ["Ended", "ended"],
  open: ["Bidding open", "open"], closed: ["Bidding closed", "ended"], scheduled: ["Not open yet", "upcoming"], hidden: ["Hidden", "draft"],
};
export function Status({ stage, big = false }: { stage: string; big?: boolean }) {
  const [label, tone] = STAGES[stage] ?? [stage, "draft"];
  return <span className={`sx-status t-${tone}${big ? " big" : ""}`}><i aria-hidden="true" />{label}</span>;
}

export function PhotoField({ label, url, onChange, shape = "wide" }: { label: string; url: string | null; onChange: (asset: { id: string; url: string } | null) => void; shape?: "wide" | "square" }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [over, setOver] = useState(false);
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true); setError("");
    try { onChange(await uploadPhoto(file)); } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className="sx-field">
      <span className="sx-label">{label}</span>
      <div className={`sx-photo ${shape}${url ? " has" : ""}${over ? " over" : ""}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}>
        {url ? <img src={url} alt="" /> : <span className="ph-empty"><IUpload size={22} /><b>{busy ? "Uploading…" : "Drop a photo"}</b><small>or click to choose</small></span>}
        <button type="button" className="ph-hit" aria-label={url ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`} onClick={() => input.current?.click()} />
        {url && <div className="ph-acts"><button type="button" onClick={() => input.current?.click()}>{busy ? "Uploading…" : "Replace"}</button><button type="button" aria-label="Remove photo" onClick={() => onChange(null)}><ITrash size={16} /></button></div>}
        <input ref={input} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} />
      </div>
      {error && <span className="sx-hint err">{error}</span>}
    </div>
  );
}

export function useQr(text: string, dark = "#1A1814", light = "#fff") {
  return useMemo(() => {
    if (!text) return "";
    const code = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM), size = code.size + 8;
    let path = "";
    for (let y = 0; y < code.size; y++) for (let x = 0; x < code.size; x++) if (code.getModule(x, y)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
  }, [text, dark, light]);
}
export function Qr({ text, label, dark, light, className = "sx-qr" }: { text: string; label: string; dark?: string; light?: string; className?: string }) {
  const svg = useQr(text, dark, light);
  return <div className={className} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Toast({ text, tone = "ink" }: { text: string; tone?: "ink" | "red" | "green" }) {
  return text ? <div className={`sx-toast t-${tone}`} role="status">{text}</div> : null;
}

type LoginError = { title: string; body: string; action?: "reload" };
function loginError(r: { status: number; data: any } | null): LoginError {
  if (!r) return { title: "Can’t reach BidZizi", body: "Check your connection, then try again." };
  const code = r.data?.error?.code;
  if (code === "LOGIN_FAILED") return { title: "Email or password is wrong", body: "Check for a typo or caps lock, then try again." };
  if (code === "TOO_MANY_ATTEMPTS") return { title: "Sign-in is paused for up to 15 minutes", body: "Too many wrong passwords in a row. For safety, wait out the pause, then try again." };
  if (r.status === 403) return { title: "This page is out of date", body: "Reload it, then sign in again.", action: "reload" };
  return { title: "Sign-in didn’t work", body: "Something went wrong on our side. Try again in a moment." };
}

export function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState<LoginError | null>(null), [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const pw = useRef<HTMLInputElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    let r: Awaited<ReturnType<typeof api<any>>> | null = null;
    try { r = await api("POST", "/api/v1/host/login", { email: email.trim(), password }); } catch (e) { if (!(e instanceof Offline)) throw e; }
    setBusy(false);
    if (r?.ok) { onIn(); return; }
    const err = loginError(r); setError(err);
    if (r?.data?.error?.code === "LOGIN_FAILED") requestAnimationFrame(() => pw.current?.select());
  }
  return (
    <main className="sx sx-login">
      <section className="login-art" aria-hidden="true">
        <div className="la-cards">
          <span className="la-card c1"><i>01</i><b>Weekend cabin</b><em>$400</em></span>
          <span className="la-card c2"><i>02</i><b>Chef&rsquo;s table</b><em>$325</em></span>
          <span className="la-card c3"><i>03</i><b>Coffee for a year</b><em>$200</em></span>
        </div>
        <p className="la-quote">Run the room.</p>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit} noValidate={false}>
          <Brand />
          <h1>Staff sign in</h1>
          {error && (
            <div className="login-err" role="alert">
              <IAlert size={20} />
              <div><b>{error.title}</b><span>{error.body}</span></div>
              {error.action === "reload" && <button type="button" className="sx-btn sm" onClick={() => location.reload()}>Reload</button>}
            </div>
          )}
          <label className="sx-field"><span className="sx-label">Email</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" autoFocus required aria-invalid={error?.title.startsWith("Email") || undefined} /></label>
          <div className="sx-field"><label className="sx-label" htmlFor="login-pw">Password</label>
            <span className="pw-wrap">
              <input id="login-pw" ref={pw} type={show ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required aria-invalid={error?.title.startsWith("Email") || undefined} />
              <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>{show ? <IEyeOff size={18} /> : <IEye size={18} />}</button>
            </span></div>
          <button className="sx-btn primary lg block" disabled={busy || !email || !password}>{busy ? "Signing in…" : error ? "Try again" : "Sign in"}</button>
          <p className="sx-fine">Forgot your password? Ask the person who set up your account.</p>
          <p className="sx-fine login-guest">Here to bid? <a href="/join">Enter an event code</a></p>
        </form>
      </section>
    </main>
  );
}
