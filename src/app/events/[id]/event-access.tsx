"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type CatalogPacket = { phase: string; event: { id: string }; [key: string]: unknown };
type Session = { authenticated: boolean; testMode: boolean; person?: { name: string } };
async function api(path: string, input?: unknown) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...(input === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "The request could not be confirmed.");
  return data;
}
export default function EventAccess({ eventId }: { eventId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState("bidder-juniper");
  const [packet, setPacket] = useState<CatalogPacket | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0), frame = useRef<HTMLIFrameElement>(null), latest = useRef<CatalogPacket | null>(null);
  const send = useCallback(() => {
    if (latest.current) frame.current?.contentWindow?.postMessage({ type: "audience-catalog", payload: latest.current }, location.origin);
  }, []);
  const load = useCallback(async (ticket: number) => {
    try {
      const result = await api(`/api/catalog/events/${encodeURIComponent(eventId)}`);
      if (epoch.current !== ticket) return;
      // A slower read from the same account cannot replace a later DB snapshot.
      if (latest.current && Date.parse(String(latest.current.serverNow)) > Date.parse(String(result.serverNow))) return;
      latest.current = result; setPacket(result); setError("");
    } catch (e) {
      if (epoch.current !== ticket) return;
      latest.current = null; setPacket(null); setError(e instanceof Error ? e.message : "Event access could not be confirmed.");
    }
  }, [eventId]);
  useEffect(() => {
    const ticket = ++epoch.current;
    latest.current = null; setPacket(null); setError("");
    api("/api/session").then(s => {
      if (epoch.current !== ticket) return;
      setSession(s); if (s.authenticated) void load(ticket);
    }).catch(() => { if (epoch.current === ticket) setError("Sign-in could not be checked. Reload to try again."); });
    return () => { ++epoch.current; latest.current = null; };
  }, [load]);
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.type === "audience-ready") send();
    };
    window.addEventListener("message", ready); return () => window.removeEventListener("message", ready);
  }, [send]);
  useEffect(() => { send(); }, [packet, send]);
  useEffect(() => {
    if (!session?.authenticated) return;
    let stopped = false, checking = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (stopped || checking || document.visibilityState !== "visible") return;
      checking = true;
      try { await load(epoch.current); } finally { checking = false; }
    };
    const tick = async () => {
      await refresh();
      if (!stopped) timer = setTimeout(tick, latest.current?.phase === "closed" ? 30_000 : 5_000);
    };
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    timer = setTimeout(tick, 5_000);
    document.addEventListener("visibilitychange", visible);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [session?.authenticated, load]);
  async function signIn() {
    const ticket = ++epoch.current; latest.current = null; setPacket(null); setError(""); setBusy(true);
    try {
      const s = await api("/api/test-auth/login", { account });
      if (epoch.current !== ticket) return;
      setSession(s); await load(ticket);
    } catch (e) { if (epoch.current === ticket) setError(e instanceof Error ? e.message : "Sign-in could not be confirmed."); }
    finally { if (epoch.current === ticket) setBusy(false); }
  }
  async function signOut() {
    const ticket = ++epoch.current;
    latest.current = null; setPacket(null); setError(""); setBusy(true);
    // Remove private frame content before the logout request. Old reads cannot adopt it again.
    setSession({ authenticated: false, testMode: true });
    try { await api("/api/session/logout", {}); }
    catch { if (epoch.current === ticket) { setSession(null); setError("Sign-out not confirmed. Reload to retry."); } }
    finally { if (epoch.current === ticket) setBusy(false); }
  }
  const controlStyle = { padding: "8px 12px", border: "1px solid #d8cebd", borderRadius: 12, background: "#fffaf0", color: "#1a1814", cursor: "pointer" };
  return <div style={{ minHeight: "100dvh", background: "#f5f0e6", color: "#1a1814", fontFamily: "Arial, sans-serif" }}>
    <div style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #d8cebd", fontSize: 12 }}>
      <span style={{ border: "1px dashed #8a8171", borderRadius: 20, padding: "6px 10px" }}>Staging test</span>
      {session?.authenticated && <><span>{session.person?.name}</span><button type="button" style={controlStyle} onClick={() => void load(epoch.current)}>Refresh event</button><button type="button" style={controlStyle} disabled={busy} onClick={() => void signOut()}>Sign out</button></>}
    </div>
    {!session?.authenticated ? <main style={{ maxWidth: 420, margin: "50px auto", padding: "0 20px" }}>
      <h1>Choose a test account</h1><p>These accounts use synthetic data. No phone verification or live auction is running.</p>
      <label htmlFor="event-test-account">Test account</label>
      <select id="event-test-account" value={account} onChange={e => setAccount(e.target.value)} disabled={busy || session?.testMode === false} style={{ ...controlStyle, display: "block", margin: "8px 0 18px", width: "100%" }}>
        <option value="bidder-juniper">Juniper viewer</option><option value="bidder-harbor">Harbor viewer</option><option value="staff-saturn">Saturn staff</option><option value="staff-pine">Pine staff</option>
      </select>
      <button type="button" style={controlStyle} disabled={busy || !session || session.testMode === false} onClick={() => void signIn()}>Sign in</button>
      {error && <p role="alert">{error}</p>}{session?.testMode === false && <p>Test sign-in is unavailable here.</p>}
    </main> : packet ? <div data-catalog-phase={packet.phase} style={{ maxWidth: 480, margin: "0 auto" }}>
      <iframe ref={frame} title="BidZizi event" src="/staging-catalog/index.html" onLoad={send} style={{ display: "block", width: "100%", height: "calc(100dvh - 72px)", minHeight: 700, border: 0 }} />
    </div> : <main style={{ maxWidth: 420, margin: "50px auto", padding: "0 20px" }}>
      {error ? <><h1>Event access unavailable</h1><p role="alert">{error}</p></> : <p>Loading event…</p>}
    </main>}
  </div>;
}
