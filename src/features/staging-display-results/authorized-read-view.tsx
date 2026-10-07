"use client";

import { useEffect, useRef, useState } from "react";
import { asset, InvalidPayload, money, parseCatalog, parseSession, parseStanding, ReadFailure, readJSON, transient, UnsupportedPayload, utc, type Catalog, type Lot, type Row } from "./read-model";
import styles from "./display-results.module.css";

type View = { packet: Catalog | null; rows: Record<string, Row>; state: "loading" | "current" | "stale" | "offline" | "denied" | "error" | "empty"; busy: boolean; message: string };
const empty = (): View => ({ packet: null, rows: {}, state: "loading", busy: true, message: "Confirming private event access…" });

export default function AuthorizedReadView({ eventId, mode }: { eventId: string; mode: "display" | "results" }) {
  const [view, setView] = useState<View>(empty);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    let snapshot = empty(), actorId: string | null = null, generation = 0, disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined, active: Promise<void> | undefined;
    const publish = (next: View) => { if (!disposed) { snapshot = next; setView(next); } };
    const clear = (message: string, state: View["state"] = "denied") => publish({ packet: null, rows: {}, state, busy: false, message });
    const stale = (offline: boolean, busy: boolean, message: string) => {
      const rows = Object.fromEntries(Object.entries(snapshot.rows).map(([id, row]) => [id, row.standing ? { ...row, state: "stale" as const } : row]));
      publish({ ...snapshot, rows, state: snapshot.packet ? (offline ? "offline" : "stale") : (busy ? "loading" : "error"), busy, message });
    };
    const run = () => {
      clearTimeout(timer);
      const ticket = ++generation, previous = active;
      controller?.abort(); controller = new AbortController();
      const signal = controller.signal, current = () => !disposed && generation === ticket && !signal.aborted;
      stale(!navigator.onLine, true, snapshot.packet ? "Refreshing · showing last confirmed data." : "Confirming private event access…");
      active = (async () => {
        // Drain canceled client reads before starting a replacement generation.
        await previous?.catch(() => {});
        if (!current()) return;
        try {
          if (!navigator.onLine) { stale(true, false, "Offline · showing last confirmed data, if available."); return; }
          const session = parseSession(await readJSON("/api/session", signal));
          if (!current()) return;
          if (session === null) { actorId = null; clear("Sign in through the event page to view this private catalog."); return; }
          if (actorId !== null && actorId !== session) publish(empty());
          actorId = session;
          const packet = parseCatalog(await readJSON(`/api/catalog/events/${encodeURIComponent(eventId)}`, signal), eventId);
          if (!current()) return;
          if (snapshot.packet && Date.parse(packet.serverNow) < Date.parse(snapshot.packet.serverNow)) throw new ReadFailure(503);
          const priorRows = snapshot.packet?.catalog?.approvalId === packet.catalog?.approvalId ? snapshot.rows : {};
          const rows: Record<string, Row> = {}, lots = packet.catalog?.lots ?? [];
          let nextIndex = 0;
          const worker = async () => {
            while (current() && nextIndex < lots.length) {
              const lot = lots[nextIndex++];
              try {
                const standing = parseStanding(await readJSON(`/api/bidder/events/${encodeURIComponent(eventId)}/lots/${lot.id}/standing`, signal), packet, lot);
                if (!current()) return;
                const prior = priorRows[lot.id]?.standing;
                rows[lot.id] = prior && (Date.parse(standing.serverNow) < Date.parse(prior.serverNow) || standing.version < prior.version)
                  ? { state: "stale", standing: prior } : { state: "current", standing };
              } catch (error) {
                if (!current()) return;
                if (error instanceof ReadFailure && error.status === 401) {
                  actorId = null; clear("Your private session is no longer available. Sign in through the event page."); controller?.abort(); return;
                }
                if (error instanceof ReadFailure && [403, 404].includes(error.status)) rows[lot.id] = { state: "denied", standing: null };
                else if (error instanceof UnsupportedPayload || error instanceof ReadFailure && error.code === "UNSUPPORTED_RULESET") rows[lot.id] = { state: "unsupported", standing: null };
                else if (transient(error) && priorRows[lot.id]?.standing) rows[lot.id] = { state: "stale", standing: priorRows[lot.id].standing };
                else rows[lot.id] = { state: "unavailable", standing: null };
              }
            }
          };
          await Promise.all([worker(), worker()]);
          if (!current()) return;
          // A cookie can change while authorized reads are held. Do not publish
          // a staged packet under a different account, even without another refresh.
          const finalSession = parseSession(await readJSON("/api/session", signal));
          if (!current()) return;
          if (finalSession !== session) { actorId = finalSession; clear("Account access changed. Refresh to confirm this event again."); return; }
          const isStale = Object.values(rows).some(row => row.state === "stale");
          publish({ packet, rows, state: isStale ? "stale" : packet.catalog?.lots.length === 0 ? "empty" : "current", busy: false,
            message: isStale ? "Some standing reads failed · showing dated, last confirmed data." : Object.values(rows).some(row => !row.standing) ? "Some standings are unavailable to this account." : "" });
        } catch (error) {
          if (!current()) return;
          if (error instanceof ReadFailure && [400, 401, 403, 404].includes(error.status)) { clear(error.status === 401 ? "Sign in through the event page to continue." : "This event is unavailable to the current account."); }
          else if (error instanceof InvalidPayload) clear("This event response could not be verified. Try again.", "error");
          else stale(!navigator.onLine, false, navigator.onLine ? "Refresh failed · showing last confirmed data, if available. Try again." : "Offline · showing last confirmed data, if available.");
        } finally {
          if (current() && document.visibilityState === "visible" && navigator.onLine && snapshot.state !== "denied") {
            timer = setTimeout(run, snapshot.packet?.phase === "closed" ? 30_000 : 5_000);
          }
        }
      })();
    };
    const pause = (offline = false) => {
      ++generation; controller?.abort(); clearTimeout(timer);
      stale(offline, false, offline ? "Offline · showing last confirmed data, if available." : "Refresh paused · showing last confirmed data.");
    };
    const visibility = () => document.visibilityState === "visible" ? run() : pause();
    const offline = () => pause(true), online = () => { if (document.visibilityState === "visible") run(); };
    const pageHide = () => { pause(); publish({ ...empty(), busy: false }); };
    const pageShow = (event: PageTransitionEvent) => { if (event.persisted) run(); };
    refresh.current = run; publish(empty());
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("offline", offline); window.addEventListener("online", online);
    window.addEventListener("pagehide", pageHide); window.addEventListener("pageshow", pageShow);
    if (document.visibilityState === "visible") run();
    return () => {
      disposed = true; ++generation; controller?.abort(); clearTimeout(timer); refresh.current = () => {};
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("offline", offline); window.removeEventListener("online", online);
      window.removeEventListener("pagehide", pageHide); window.removeEventListener("pageshow", pageShow);
    };
  }, [eventId, mode]);

  const packet = view.packet?.event.id === eventId.toLowerCase() ? view.packet : null;
  const eventPath = `/events/${encodeURIComponent(eventId)}`;
  const old = view.state === "stale" || view.state === "offline";
  const phaseLabel = packet?.phase === "open" ? "Window open" : packet?.phase === "closed" ? "Window closed" : "Scheduled";
  return <main className={styles.board} data-private-board={mode} data-event-id={eventId} data-state={view.state} data-phase={packet?.phase} aria-busy={view.busy}>
    <header className={styles.topbar}>
      <div className={styles.wordmark}>{packet?.organization.name ?? "BidZizi"}<span>Private view</span></div>
      <nav aria-label="Private display views"><a href={eventPath}>Event &amp; sign in</a><a href={`${eventPath}/${mode === "display" ? "results" : "display"}`}>{mode === "display" ? "Lot standing" : "Large screen display"}</a></nav>
    </header>
    <div className={styles.content}>
      {packet ? <section className={styles.hero} aria-label="Event context">
        <div><p className={styles.kicker}>Published catalog · private view</p><p className={styles.eyebrow}>{packet.event.eyebrow}</p><h1>{packet.event.name}</h1><p className={styles.welcome}>{packet.event.welcome}</p><p className={styles.venue}>{packet.event.venue}</p>
          {packet.event.sponsorsEnabled && packet.event.sponsors.length > 0 && <p className={styles.sponsors}>With thanks to {packet.event.sponsors.map(sponsor => sponsor.name).join(" · ")}</p>}
        </div>
        <dl className={styles.schedule}><div><dt>Shared lot window opens</dt><dd><time dateTime={packet.schedule.opensAt}>{utc(packet.schedule.opensAt)}</time></dd></div><div><dt>Closes</dt><dd><time dateTime={packet.schedule.closesAt}>{utc(packet.schedule.closesAt)}</time></dd></div></dl>
      </section> : <section className={styles.hero}><div><p className={styles.kicker}>Private browser view</p><h1>{mode === "display" ? "Event display" : "Lot standing"}</h1><p className={styles.welcome}>Use the event page to sign in with an account authorized for this event.</p></div></section>}
      <div className={styles.notice} data-stale={old} role="status" aria-live="polite">
        <div><strong>{view.busy ? "Refreshing private view…" : view.state === "offline" ? "Offline · last confirmed data" : old ? "Stale · last confirmed data" : packet ? `Catalog confirmed · ${phaseLabel}` : view.state === "loading" ? "Confirming access…" : "Private view unavailable"}</strong>
          {packet && <p>{old ? "Last server-reported status" : "Server status"} as of <time dateTime={packet.serverNow}>{utc(packet.serverNow)}</time></p>}
          {view.message && <p>{view.message}</p>}
        </div>
        <button type="button" onClick={() => refresh.current()}>{mode === "display" ? "Refresh display" : "Refresh standing"}</button>
      </div>
      {packet?.phase === "scheduled" && <p className={styles.empty}>The catalog appears when its server-authorized window opens. Approved lots are not available yet.</p>}
      {packet?.catalog && packet.catalog.lots.length === 0 && <p className={styles.empty}>No published lots in this catalog.</p>}
      {packet?.catalog && packet.catalog.lots.length > 0 && (mode === "display" ? <section className={styles.displayLots} aria-label="Approved lots">
        {packet.catalog.lots.map(lot => <article key={lot.id} className={styles.lot} data-lot-id={lot.id} data-standing-state={view.rows[lot.id]?.state ?? "unavailable"}>
          <span className={styles.number}>{lot.number}</span>
          {lot.image && <img className={styles.lotImage} src={asset(lot.image)} alt={lot.alt} width={120} height={92} />}
          <div className={styles.lotText}><p className={styles.kicker}>{lot.category}</p><h2>{lot.title}</h2><p>{lot.short}</p></div>
          <StandingCell row={view.rows[lot.id]} />
        </article>)}
      </section> : <section className={styles.results} aria-labelledby="standing-heading"><h2 id="standing-heading">Lot standing</h2>
        <table><thead><tr><th scope="col">Lot</th><th scope="col">Published item</th><th scope="col">Accepted amount · USD</th><th scope="col">Standing &amp; read time</th></tr></thead><tbody>
          {packet.catalog.lots.map(lot => <tr key={lot.id} data-lot-id={lot.id} data-standing-state={view.rows[lot.id]?.state ?? "unavailable"}>
            <th scope="row" className={styles.tableNumber}>{lot.number}</th><td className={styles.tableLot}><strong>{lot.title}</strong><span>{lot.category}</span></td><td><Amount row={view.rows[lot.id]} /></td><td><StandingDetails row={view.rows[lot.id]} /></td>
          </tr>)}
        </tbody></table>
      </section>)}
      <footer className={styles.footer}><p>Published catalog · Draft preview is separate from this published catalog.</p><p>Each lot has its own read timestamp; the table is not an atomic event-wide snapshot.</p><p data-ruleset="staging-usd-manual-v1">Synthetic test standing · USD · $25 minimum increment.</p><p>Standing is provisional; it does not confirm winners or settlement.</p></footer>
    </div>
  </main>;
}
function Amount({ row }: { row?: Row }) {
  if (!row?.standing) return <span className={styles.unavailable}>{row?.state === "denied" ? "Standing access unavailable" : row?.state === "unsupported" ? "Unsupported test standing" : "Standing unavailable"}</span>;
  return row.standing.currentAmountMinor === null ? <strong className={styles.noBid}>No accepted bids</strong> : <strong className={styles.amount} data-current-amount data-stale={row.state === "stale"}>{money(row.standing.currentAmountMinor)}</strong>;
}
function StandingDetails({ row }: { row?: Row }) {
  if (!row?.standing) return <p className={styles.readTime}>{row?.state === "denied" ? "Existing bidder authority is required for numeric standing." : "Refresh to check this lot again."}</p>;
  const standing = row.standing;
  return <div className={styles.readTime}>
    <strong>{row.state === "stale" ? "Stale · last confirmed" : standing.phase === "closed" ? "Closed standing" : "Current standing"}</strong>
    <p>{standing.acceptedBidCount} accepted {standing.acceptedBidCount === 1 ? "bid" : "bids"} · version {standing.version}</p>
    <p>As of <time data-standing-as-of dateTime={standing.serverNow}>{utc(standing.serverNow)}</time></p>
    <p>{standing.currentAmountMinor === null ? "Standing origin" : "Last accepted change"}: <time data-standing-updated-at dateTime={standing.updatedAt}>{utc(standing.updatedAt)}</time></p>
  </div>;
}
function StandingCell({ row }: { row?: Row }) {
  return <div className={styles.standing}><p className={styles.kicker}>{row?.standing ? row.state === "stale" ? "Last confirmed amount · USD" : row.standing.phase === "closed" ? "Closed accepted amount · USD" : "Current accepted amount · USD" : "Private lot standing"}</p><Amount row={row} /><StandingDetails row={row} /></div>;
}
