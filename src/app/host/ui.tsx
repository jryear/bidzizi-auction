"use client";

import { useRef, useState } from "react";
import { api, errorText, Offline } from "../../lib/api";

export function StageChip({ stage }: { stage: string }) {
  const label = { draft: "Draft", upcoming: "Live · not started", running: "Running now", ended: "Ended", open: "Bidding open", closed: "Bidding closed", scheduled: "Not open yet" }[stage] ?? stage;
  const tone = { draft: "draft", upcoming: "upcoming", running: "open", ended: "closed", open: "open", closed: "closed", scheduled: "upcoming" }[stage] ?? "draft";
  return <span className={`chip ${tone}`}>{label}</span>;
}

/** Downscale in the browser so phone photos upload quickly and fit the server's limits. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("encode")), "image/jpeg", 0.86));
}

export function PhotoPicker({ url, onChange, label = "Photo" }: { url: string | null; onChange: (asset: { id: string; url: string } | null) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const blob = await shrink(file);
      const r = await fetch("/api/v1/host/assets", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob, credentials: "same-origin" });
      const data = await r.json().catch(() => null);
      if (r.ok) onChange(data); else setError(data?.error?.message ?? "Upload failed.");
    } catch { setError("That image couldn't be read. Try a JPEG or PNG."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className="field">
      <span>{label}</span>
      <div className="photo-pick">
        <div className="preview">{url && <img src={url} alt="" />}</div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="row">
            <button type="button" className="btn small" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Uploading…" : url ? "Replace" : "Upload"}</button>
            {url && <button type="button" className="btn small ghost" onClick={() => onChange(null)}>Remove</button>}
          </div>
          {error && <span className="small" style={{ color: "var(--red)" }}>{error}</span>}
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} />
      </div>
    </div>
  );
}

export function Login({ onIn }: { onIn: () => void }) {
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
        <p className="small muted" style={{textAlign:"center"}}>Forgot your password? Ask another signed-in staff member to open Staff & access and create a reset link. If you are the only host, contact the event administrator.</p>
        <p className="small faint" style={{ textAlign: "center" }}>Joining an event? <a href="/join">Enter a code</a></p>
      </div>
    </main>
  );
}

