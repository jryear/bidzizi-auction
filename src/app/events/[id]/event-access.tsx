"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DemoEntryForm, {pendingDemoEntry,entryStorageKey} from "./demo-entry-form";

type CatalogPacket = { phase: string; event: { id: string }; [key: string]: unknown };
type Person = { id: string; name: string };
type BidderContext = { testMode: true; person: Person; businesses: { id: string; name: string; canBid: boolean }[] };
type Session = { authenticated: boolean; testMode: boolean; person?: Person };
class RequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function api(path: string, input?: unknown) {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...(input === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }) });
  const data = await response.json();
  if (!response.ok) throw new RequestError(data.error?.message || "The request could not be confirmed.", response.status);
  return data;
}
export default function EventAccess({ eventId }: { eventId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState("bidder-juniper");
  const [packet, setPacket] = useState<CatalogPacket | null>(null);
  const [bidder, setBidder] = useState<BidderContext | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoEntry,setDemoEntry]=useState(false),[entryRecovery,setEntryRecovery]=useState(false);
  const epoch = useRef(0), sequence = useRef(0), frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef<CatalogPacket | null>(null), currentBidder = useRef<BidderContext | null>(null), stale = useRef(false);
  const send = useCallback(() => {
    const target = frame.current?.contentWindow;
    if (!target || !latest.current) return;
    target.postMessage({ type: "audience-catalog", payload: latest.current }, location.origin);
    target.postMessage({ type: "bidder-context", eventId, epoch: epoch.current, refresh: sequence.current, context: currentBidder.current, stale: stale.current }, location.origin);
  }, [eventId]);
  const clear = useCallback(() => {
    latest.current = null; currentBidder.current = null; stale.current = false;
    setPacket(null); setBidder(null);
  }, []);
  const load = useCallback(async (ticket: number) => {
    const attempt = ++sequence.current;
    const results = await Promise.allSettled([
      api(`/api/catalog/events/${encodeURIComponent(eventId)}`),
      api(`/api/bidder/events/${encodeURIComponent(eventId)}/context`),
    ]);
    if (epoch.current !== ticket || sequence.current !== attempt) return;
    const catalogResult = results[0], bidderResult = results[1];
    if (catalogResult.status === "rejected") {
      const cause = catalogResult.reason;
      if (cause instanceof RequestError && [401, 403, 404].includes(cause.status)) clear();
      else { stale.current = true; send(); }
      setError(cause instanceof Error ? cause.message : "Event access could not be confirmed.");
      return;
    }
    if (bidderResult.status === "rejected" && bidderResult.reason instanceof RequestError && bidderResult.reason.status === 401) {
      clear(); setError("Sign in to continue."); return;
    }
    const result = catalogResult.value;
    if (latest.current && Date.parse(String(latest.current.serverNow)) > Date.parse(String(result.serverNow))) return;
    latest.current = result; setPacket(result);
    if (bidderResult.status === "fulfilled") {
      currentBidder.current = bidderResult.value; setBidder(bidderResult.value); stale.current = !navigator.onLine; setError("");
    } else if (bidderResult.reason instanceof RequestError && [403, 404].includes(bidderResult.reason.status)) {
      // Catalog VIEW access remains separate from permission to bid.
      currentBidder.current = null; setBidder(null); stale.current = false; setError("");
    } else {
      stale.current = true; setError("Bidding status could not be refreshed. The last confirmed view is shown.");
    }
    send();
  }, [eventId, clear, send]);
  useEffect(() => {
    const ticket = ++epoch.current; ++sequence.current;
    clear(); setError("");
    Promise.allSettled([api("/api/session"),api(`/api/demo/events/${encodeURIComponent(eventId)}/entry`)]).then(results => {
      if (epoch.current !== ticket) return;
      const sessionResult=results[0],entryResult=results[1];
      if(sessionResult.status!=="fulfilled"){setError("Sign-in could not be checked. Reload to try again.");return;}
      const s=sessionResult.value,eligible=entryResult.status==="fulfilled"&&entryResult.value.demoEntry===true&&entryResult.value.eventId===eventId;
      const recovering=Boolean(s.authenticated&&pendingDemoEntry(eventId));
      setDemoEntry(eligible);setEntryRecovery(recovering);setSession(s); if (s.authenticated&&!recovering) void load(ticket);
    }).catch(() => { if (epoch.current === ticket) setError("Sign-in could not be checked. Reload to try again."); });
    return () => { ++epoch.current; ++sequence.current; latest.current = null; currentBidder.current = null; };
  }, [load, clear]);
  const entryReady=useCallback((s:Session,entryEpoch:number)=>{
    if(epoch.current!==entryEpoch)return;
    const ticket=++epoch.current;++sequence.current;clear();setError("");setSession(s);setEntryRecovery(false);void load(ticket);
  },[clear,load]);
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data?.type === "audience-ready") send();
    };
    window.addEventListener("message", ready); return () => window.removeEventListener("message", ready);
  }, [send]);
  useEffect(() => { send(); }, [packet, bidder, send]);
  useEffect(() => {
    if (!session?.authenticated||entryRecovery) return;
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
    const offline = () => { stale.current = true; send(); };
    const online = () => { void refresh(); };
    timer = setTimeout(tick, 5_000);
    document.addEventListener("visibilitychange", visible); window.addEventListener("offline", offline); window.addEventListener("online", online);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("offline", offline); window.removeEventListener("online", online); };
  }, [session?.authenticated, entryRecovery, load, send]);
  async function signIn() {
    const ticket = ++epoch.current; ++sequence.current; clear(); setError(""); setBusy(true);
    try {
      const s = await api("/api/test-auth/login", { account });
      if (epoch.current !== ticket) return;
      setSession(s); await load(ticket);
    } catch (e) { if (epoch.current === ticket) setError(e instanceof Error ? e.message : "Sign-in could not be confirmed."); }
    finally { if (epoch.current === ticket) setBusy(false); }
  }
  async function signOut() {
    const ticket = ++epoch.current; ++sequence.current;
    clear(); setError(""); setBusy(true);
    // Unmount private content before logout. Captured responses belong to the old epoch.
    setSession({ authenticated: false, testMode: true });
    setEntryRecovery(false);try{sessionStorage.removeItem(entryStorageKey(eventId));}catch{}
    try { await api("/api/session/logout", {}); }
    catch { if (epoch.current === ticket) { setSession(null); setError("Sign-out not confirmed. Reload to retry."); } }
    finally { if (epoch.current === ticket) setBusy(false); }
  }
  const entryEpoch=epoch.current;
  const controlStyle = { padding: "8px 12px", border: "1px solid #d8cebd", borderRadius: 12, background: "#fffaf0", color: "#1a1814", cursor: "pointer" };
  return <div style={{ minHeight: "100dvh", background: "#f5f0e6", color: "#1a1814", fontFamily: "Arial, sans-serif" }}>
    <div style={{ padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid #d8cebd", fontSize: 12 }}>
      <span style={{ border: "1px dashed #8a8171", borderRadius: 20, padding: "6px 10px" }}>Staging test</span>
      {session?.authenticated && <><span>{session.person?.name}</span><button type="button" style={controlStyle} disabled={entryRecovery} onClick={() => void load(epoch.current)}>Refresh event</button><button type="button" style={controlStyle} disabled={busy} onClick={() => void signOut()}>Sign out</button></>}
    </div>
    {(entryRecovery||(demoEntry&&!session?.authenticated))?<DemoEntryForm key={`${eventId}:${entryEpoch}`} eventId={eventId} initialSession={session} onReady={s=>entryReady(s,entryEpoch)}/>:!session?.authenticated ? <main style={{ maxWidth: 420, margin: "50px auto", padding: "0 20px" }}>
      <h1>Choose a test account</h1><p>These accounts use synthetic data. No phone verification or live auction is running.</p>
      <label htmlFor="event-test-account">Test account</label>
      <select id="event-test-account" value={account} onChange={e => setAccount(e.target.value)} disabled={busy || !session || session.testMode === false} style={{ ...controlStyle, display: "block", margin: "8px 0 18px", width: "100%" }}>
        <option value="bidder-juniper">Juniper viewer</option><option value="bidder-harbor">Harbor viewer</option><option value="bidder-juniper-coworker">Juniper coworker</option><option value="bidder-viewer">View-only member</option><option value="bidder-member">Member without admission</option><option value="bidder-bid-only">BID without VIEW</option><option value="bidder-unlisted">Unlisted person</option><option value="bidder-pine">Pine bidder</option><option value="staff-saturn">Saturn staff</option><option value="staff-pine">Pine staff</option>
      </select>
      <button type="button" style={controlStyle} disabled={busy || !session || session.testMode === false} onClick={() => void signIn()}>Sign in</button>
      {error && <p role="alert">{error}</p>}{session?.testMode === false && <p>Test sign-in is unavailable here.</p>}
    </main> : packet ? <div data-catalog-phase={packet.phase} data-bidder-person={bidder?.person.id} style={{ maxWidth: 480, margin: "0 auto" }}>
      {error && <p role="status" style={{ padding: "8px 14px", fontSize: 12 }}>{error}</p>}
      <iframe ref={frame} title="BidZizi event" src="/staging-catalog/index.html" onLoad={send} style={{ display: "block", width: "100%", height: "calc(100dvh - 72px)", minHeight: 700, border: 0 }} />
    </div> : <main style={{ maxWidth: 420, margin: "50px auto", padding: "0 20px" }}>
      {error ? <><h1>Event access unavailable</h1><p role="alert">{error}</p></> : <p>Loading event…</p>}
    </main>}
  </div>;
}
