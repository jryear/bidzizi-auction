"use client";
// The attendee app shell: one snapshot from the server, polled; in-app navigation through the URL so Back, reload and
// section switches behave; and the moments that matter (a bid landing, being outbid, winning) detected by comparing snapshots.
import { addTransitionType, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, ViewTransition } from "react";
import { api, fmtClock, initials } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { IBookmark, IChevL, IGrid, IHeart, IInfo, ITicket, IWifiOff } from "../../../lib/icons";
import { type Item, type PendingBid, type Snapshot, wasSeen } from "./model";
import { Catalog } from "./catalog";
import { ItemPage } from "./item";
import { BidSheet, ResumePending } from "./sheet";
import { MyBids } from "./mine";
import { EventPage } from "./event";
import { Give } from "./give";
import { Join, PreviewBanner } from "./join";
import { Alerts, Celebration, type Alert } from "./moments";
import { Mark } from "./ui";
import "./participant.css";

export type Section = "items" | "watching" | "mine" | "event" | "give";
type Route = { s: Section; i: string | null };
type SheetState = { itemId: string; amount?: number } | null;
export type Nav = {
  openItem: (id: string) => void;
  openSheet: (item: Item, amount?: number) => void;
  tab: (s: Section) => void;
  back: () => void;
  watch: (item: Item, on: boolean) => void;
};

const SECTIONS: Section[] = ["items", "watching", "mine", "event", "give"];
function readRoute(): Route {
  const q = new URLSearchParams(location.search);
  const s = q.get("s") as Section;
  return { s: SECTIONS.includes(s) ? s : "items", i: q.get("i") };
}
const urlOf = (r: Route) => `${location.pathname}?${new URLSearchParams({ ...(r.s !== "items" || r.i ? { s: r.s } : {}), ...(r.i ? { i: r.i } : {}) }).toString()}`.replace(/\?$/, "");

export default function Participant({ code }: { code: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [missing, setMissing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [asOf, setAsOf] = useState<number | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [route, setRoute] = useState<Route>({ s: "items", i: null });
  const [sheet, setSheet] = useState<SheetState>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [celebrate, setCelebrate] = useState<Item | null>(null);
  const [pending, setPending] = useState<PendingBid | null>(null);
  const [cameFrom, setCameFrom] = useState<string | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const scrolls = useRef<Record<string, number>>({});
  const pendingKey = `bz_pending_${code}`;
  const serverNow = nowMs + offsetMs;

  const notify = useCallback((a: Omit<Alert, "id">) => setAlerts(list => [...list.filter(x => x.key !== a.key || !a.key), { ...a, id: Math.random().toString(36).slice(2) }].slice(-3)), []);
  const dismiss = useCallback((id: string) => setAlerts(list => list.filter(a => a.id !== id)), []);

  // ------------------------------------------------------------ data
  const fails = useRef(0);
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const r = await api<Snapshot>("GET", `/api/v1/e/${code}`);
      if (r.status === 404) { setMissing(true); return true; }
      if (!r.ok) throw new Error("unavailable");
      const next = r.data, prev = snapRef.current;
      const at = new Date(next.serverNow).getTime();
      if (next.me) {
        for (const item of next.items) {
          const before = prev?.items.find(p => p.id === item.id);
          if (prev?.me && before?.leader?.isMe && item.leader && !item.leader.isMe && item.phase === "open") {
            navigator.vibrate?.([60, 40, 60]);
            notify({ key: `outbid-${item.id}`, tone: "red", itemId: item.id, title: `Outbid on ${item.title}`,
              body: `${item.leader.business} bid ${formatMoney(item.currentMinor!)}.`, action: item.minimumNextMinor ? { label: `Bid ${formatMoney(item.minimumNextMinor)}`, amount: item.minimumNextMinor } : undefined });
          }
        }
        const won = next.items.find(i => i.award?.isMe && !wasSeen(`bz_won_${code}_${i.id}`));
        if (won) setCelebrate(c => c ?? won);
      }
      snapRef.current = next;
      setSnap(next); setOffline(false); setAsOf(at); fails.current = 0;
      setOffsetMs(at - Date.now());
      return true;
    } catch { setOffline(true); fails.current++; return false; }
  }, [code, notify]);

  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    // 4s while healthy; back off to 30s while the connection is failing.
    const tick = async () => {
      if (document.visibilityState === "visible") await load();
      if (!stop) timer = setTimeout(tick, Math.min(30_000, 4000 * 2 ** Math.min(fails.current, 3)));
    };
    tick();
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    const wake = () => { if (document.visibilityState === "visible") { clearTimeout(timer); tick(); } };
    document.addEventListener("visibilitychange", wake); window.addEventListener("online", wake);
    return () => { stop = true; clearTimeout(timer); clearInterval(clock); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [load]);

  useEffect(() => { try { const raw = localStorage.getItem(pendingKey); setPending(raw ? JSON.parse(raw) : null); } catch { /* ignore */ } }, [pendingKey]);

  // Browsers abort a view transition when the viewport resizes mid-animation (mobile address bars do this). The navigation
  // still completes without the animation, so that abort is not an error worth surfacing.
  useEffect(() => {
    const isAbort = (err: unknown) => err instanceof DOMException && /transition/i.test(err.message) && ["InvalidStateError", "AbortError", "TimeoutError"].includes(err.name);
    const onError = (e: ErrorEvent) => { if (isAbort(e.error)) e.preventDefault(); };
    const onReject = (e: PromiseRejectionEvent) => { if (isAbort(e.reason)) e.preventDefault(); };
    window.addEventListener("error", onError); window.addEventListener("unhandledrejection", onReject);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onReject); };
  }, []);

  // ------------------------------------------------------------ navigation
  useEffect(() => {
    setRoute(readRoute());
    const onPop = () => {
      const next = readRoute(), st = history.state as { sheet?: string; amount?: number } | null;
      setSheet(st?.sheet ? { itemId: st.sheet, amount: st.amount } : null);
      const prev = routeRef.current;
      if (prev.i === next.i && prev.s === next.s) return;
      startTransition(() => {
        addTransitionType(prev.i && !next.i ? "nav-back" : next.i && !prev.i ? "nav-forward" : "tab");
        setRoute(next);
      });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const routeRef = useRef(route); routeRef.current = route;
  const go = useCallback((next: Route, type: "nav-forward" | "nav-back" | "tab") => {
    const cur = routeRef.current;
    scrolls.current[cur.i ? `i:${cur.i}` : cur.s] = window.scrollY;
    history.pushState({ bz: true }, "", urlOf(next));
    startTransition(() => { addTransitionType(type); setRoute(next); });
  }, []);

  // Restore where you were: sections keep their scroll; returning from an item pulses the card you left.
  useLayoutEffect(() => {
    if (route.i) { window.scrollTo(0, 0); return; }
    const y = scrolls.current[route.s];
    window.scrollTo(0, y ?? 0);
  }, [route.s, route.i]);

  const nav: Nav = useMemo(() => ({
    openItem: id => { setCameFrom(id); go({ s: routeRef.current.s, i: id }, "nav-forward"); },
    tab: s => { if (s === routeRef.current.s && !routeRef.current.i) { window.scrollTo({ top: 0, behavior: "smooth" }); return; } go({ s, i: null }, "tab"); },
    back: () => {
      if ((history.state as { bz?: boolean } | null)?.bz) history.back();
      else go({ s: routeRef.current.s, i: null }, "nav-back");
    },
    openSheet: (item, amount) => { history.pushState({ bz: true, sheet: item.id, amount }, "", location.href); setSheet({ itemId: item.id, amount }); },
    watch: async (item, on) => {
      setSnap(s => s && { ...s, items: s.items.map(i => i.id === item.id ? { ...i, watching: on } : i) });
      const r = await api("POST", `/api/v1/e/${code}/watch`, { itemId: item.id, on }).catch(() => null);
      if (!r?.ok) notify({ tone: "ink", title: "Couldn't update your watchlist", body: "Check your connection and try again." });
      load();
    },
  }), [code, go, load, notify]);
  // An outbid alert repeats what the page already says on that item's page and on My bids, so it isn't shown there.
  const redundant = useCallback((a: Alert, r: Route) => Boolean(a.itemId && a.tone === "red" && (r.i === a.itemId || (!r.i && r.s === "mine"))), []);
  useEffect(() => { setAlerts(list => { const keep = list.filter(a => !redundant(a, route)); return keep.length === list.length ? list : keep; }); }, [alerts, route, redundant]);
  const closeSheet = useCallback(() => { if ((history.state as { sheet?: string } | null)?.sheet) history.back(); else setSheet(null); }, []);

  // ------------------------------------------------------------ render
  if (missing) return <NotFound />;
  if (!snap) return <Loading offline={offline} />;
  if (!snap.me) return <Join snap={snap} code={code} onJoined={load} preview={snap.preview ? <PreviewBanner /> : null} />;

  const me = snap.me, e = snap.event;
  const item = route.i ? snap.items.find(i => i.id === route.i) ?? null : null;
  const sheetItem = sheet ? snap.items.find(i => i.id === sheet.itemId) ?? null : null;
  const outbid = snap.items.filter(i => i.phase === "open" && i.myBidCount > 0 && !i.leader?.isMe).length;
  const wonCount = snap.items.filter(i => i.award?.isMe).length;
  const tabs = SECTIONS.filter(s => s !== "give" || e.donations.enabled);
  const stale = offline;
  const screenKey = item ? `item-${item.id}` : route.s;
  const common = { snap, now: serverNow, nav, code, stale, pending };

  const navEl = (where: "bottom" | "top") => (
    <nav className={`pa-nav ${where}`} aria-label="Sections">
      <div className="pa-nav-in" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(t => {
          const on = route.s === t && !item;
          const Icon = { items: IGrid, watching: IBookmark, mine: ITicket, event: IInfo, give: IHeart }[t];
          const count = t === "mine" ? outbid || (wonCount ? wonCount : 0) : t === "watching" ? snap.items.filter(i => i.watching).length : 0;
          return (
            <button key={t} type="button" className={`pa-tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined} onClick={() => nav.tab(t)}>
              <Icon size={21} />
              <span>{{ items: "Items", watching: "Watching", mine: "My bids", event: "Event", give: "Donate" }[t]}</span>
              {t === "mine" && count > 0 && <em className={`dot${outbid ? "" : " won"}`} aria-label={outbid ? `${outbid} outbid` : `${wonCount} won`}>{count}</em>}
              {t === "watching" && count > 0 && <em className="dot quiet" aria-hidden="true">{count}</em>}
            </button>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className="pa" data-theme={e.theme} data-screen={item ? "item" : route.s}>
      <a className="skip" href="#main">Skip to content</a>
      {item ? (
        <header className="pa-topbar" style={{ viewTransitionName: "pa-head" }}>
          <button type="button" className="back" onClick={nav.back}><IChevL size={22} />{{ items: "Items", watching: "Watching", mine: "My bids", event: "Event", give: "Donate" }[route.s]}</button>
          <span className="wordmark">{e.name}</span>
          <span className="chip-pass" title={`Bidding as ${me.businessName}`}><Mark name={me.businessName} you size={28} /><span>{me.businessName}</span></span>
        </header>
      ) : (
        <header className="pa-pass" style={{ viewTransitionName: "pa-head" }}>
          <div className="pass-badge">
            <span className="mark ci you" style={{ "--s": "44px" } as React.CSSProperties} aria-hidden="true">{initials(me.businessName)}</span>
            <span className="pass-text"><b>{me.businessName}</b><small>{me.displayName}</small></span>
          </div>
          <div className="pass-event"><span className="pass-ev-name">{e.name}</span><span className="pass-ev-code">{e.code}</span></div>
          {navEl("top")}
        </header>
      )}
      {offline && (
        <div className="pa-offline" role="status">
          <IWifiOff size={18} />
          <span><b>Reconnecting.</b> Standings as of {asOf ? fmtClock(new Date(asOf)) : "earlier"}. Bids can&rsquo;t be confirmed until you&rsquo;re back.</span>
        </div>
      )}
      {snap.preview && <PreviewBanner />}

      <main id="main" className="pa-main">
        <ViewTransition key={screenKey} enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", tab: "tab-fade", default: "none" }}
          exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", tab: "tab-fade", default: "none" }} default="none">
          <div className="pa-screen">
            {item ? <ItemPage {...common} item={item} /> :
              route.s === "items" ? <Catalog {...common} cameFrom={cameFrom} /> :
              route.s === "watching" ? <Catalog {...common} cameFrom={cameFrom} watching /> :
              route.s === "mine" ? <MyBids {...common} /> :
              route.s === "event" ? <EventPage {...common} /> :
              <Give {...common} onDone={load} notify={notify} />}
          </div>
        </ViewTransition>
      </main>

      {!item && navEl("bottom")}

      {sheetItem && <BidSheet key={sheetItem.id} item={sheetItem} me={me} code={code} pendingKey={pendingKey} initialAmount={sheet?.amount} offline={offline}
        onPending={setPending} onClose={closeSheet} onSettled={load} notify={notify} />}
      <ResumePending code={code} pendingKey={pendingKey} onResolved={(text, ok) => { setPending(null); notify({ key: "resume", tone: ok ? "green" : "ink", title: text }); load(); }} />
      <Alerts alerts={alerts.filter(a => !redundant(a, route))} onDismiss={dismiss} onAct={a => { dismiss(a.id); const it = snap.items.find(i => i.id === a.itemId); if (it) nav.openSheet(it, a.action?.amount); }} />
      {celebrate && <Celebration item={celebrate} code={code} instructions={me.winnerInstructions} onClose={target => {
        setCelebrate(null);
        if (target === "mine") nav.tab("mine");
        setTimeout(() => { const more = snapRef.current?.items.find(i => i.award?.isMe && !wasSeen(`bz_won_${code}_${i.id}`)); if (more) setCelebrate(more); }, 400);
      }} />}
    </div>
  );
}

function Loading({ offline }: { offline: boolean }) {
  return (
    <div className="pa pa-center">
      <div className="loading-card" role="status">
        <span className="pa-brand">Bid<i>Zizi</i></span>
        {offline ? <><IWifiOff size={22} /><p>Can&rsquo;t reach the event yet. Retrying…</p></> : <><span className="loader" aria-hidden="true"><i /><i /><i /></span><p>Opening the event…</p></>}
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="pa pa-center">
      <div className="loading-card">
        <span className="pa-brand">Bid<i>Zizi</i></span>
        <h1 className="nf-title">We can&rsquo;t find that event</h1>
        <p>It may not be open yet, or the code has a typo. Check the code shown by your host.</p>
        <a className="btn primary block" href="/join">Enter a code</a>
      </div>
    </div>
  );
}
