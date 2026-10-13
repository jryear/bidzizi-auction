"use client";
// Live → Devices: which phones and browsers guests are actually using, and every problem anyone hit, within seconds.
import { useEffect, useRef, useState } from "react";
import { api, fmtClock } from "../../../lib/api";
import { IAlert, ICheck, ICopy, IPhone } from "../../../lib/icons";

export type Problem = { id: string; at: string; source: "guest" | "staff"; kind: "error" | "health"; check: string; message: string; detail: string; route: string;
  browser: string; version: string; os: string; osVersion: string; inApp: string; viewport: string; who: string };
type Group = { browser: string; version: string; os: string; osVersion: string; deviceClass: string; inApp: string; devices: number; joined: number; active: number; problems: number };
export type DevicesData = { serverNow: string; totals: { devices: number; joined: number; active: number; problems: number }; groups: Group[]; problems: Problem[] };

const deviceName = (p: { browser: string; version: string; os: string; osVersion: string; inApp: string }) =>
  [p.inApp ? `${p.inApp} app` : `${p.browser || "Unknown browser"}${p.version ? ` ${p.version}` : ""}`, p.os ? `${p.os}${p.osVersion ? ` ${p.osVersion}` : ""}` : ""].filter(Boolean).join(" · ");

/** Human words for what went wrong, before the technical message. */
export function problemTitle(p: Problem): string {
  if (p.check === "bid-sheet") return "Their Bid button couldn't be tapped";
  if (p.check === "app-not-started") return "The guest app didn't start on their phone";
  if (p.check === "error-boundary") return "The guest app crashed; they were offered simple mode";
  if (p.source === "staff") return "A Studio error";
  return "An error on their phone";
}

/** Polls while Live is open. New problems after the first load are passed to `onNew` (for an alert and a toast). */
export function useDevices(eventId: string, onNew: (p: Problem[]) => void) {
  const [data, setData] = useState<DevicesData | null>(null);
  const seen = useRef<Set<string> | null>(null), notify = useRef(onNew);
  notify.current = onNew;
  useEffect(() => {
    let stop = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      const r = await api<DevicesData>("GET", `/api/v1/host/events/${eventId}/devices`).catch(() => null);
      if (stop || !r?.ok) return;
      const fresh = seen.current ? r.data.problems.filter(p => !seen.current!.has(p.id)) : [];
      seen.current = new Set(r.data.problems.map(p => p.id));
      setData(r.data);
      if (fresh.length) notify.current(fresh);
    };
    load();
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [eventId]);
  return data;
}

export function DevicesPanel({ data, code }: { data: DevicesData | null; code: string }) {
  const [copied, setCopied] = useState(false);
  const simple = typeof location === "undefined" ? `/e/${code}/simple` : `${location.origin}/e/${code}/simple`;
  if (!data) return <section className="side-card devices"><div className="fc-head"><h3>Devices</h3></div><p className="sx-muted">Checking…</p></section>;
  const { totals, groups, problems } = data;
  return (
    <section className="side-card devices" aria-label="Devices">
      <div className="fc-head"><h3>Devices</h3><span className={`dv-state${totals.problems ? " bad" : ""}`}>{totals.problems ? <><IAlert size={14} />{totals.problems} problem{totals.problems === 1 ? "" : "s"}</> : <><ICheck size={14} />No reported problems</>}</span></div>
      <p className="dv-sum">{totals.devices ? <><b>{totals.devices}</b> device{totals.devices === 1 ? "" : "s"} opened the event · <b>{totals.joined}</b> joined · <b>{totals.active}</b> active now</> : "No guest devices yet. They appear here as people open your link."}</p>
      {groups.length > 0 && (
        <ul className="dv-groups">
          {groups.slice(0, 12).map(g => (
            <li key={deviceName(g)} className={g.problems ? "bad" : ""}>
              <IPhone size={16} />
              <span className="dv-name"><b>{deviceName(g)}</b>{g.inApp && <small>Opened inside {g.inApp}</small>}</span>
              <span className="dv-n" title={`${g.joined} joined`}>{g.devices}</span>
              {g.problems > 0 && <span className="dv-bad" title="Problems on these devices">{g.problems}</span>}
            </li>
          ))}
        </ul>
      )}
      {problems.length > 0 && (
        <div className="dv-problems">
          <h4>Problems</h4>
          <ol>
            {problems.slice(0, 8).map(p => (
              <li key={p.id}>
                <span className="dv-time">{fmtClock(p.at)}</span>
                <div><b>{problemTitle(p)}</b><small>{p.who} · {deviceName(p)}{p.viewport ? ` · ${p.viewport.split("@")[0]}` : ""}</small>
                  <details><summary>Details</summary><code>{p.message}{p.detail ? `\n${p.detail}` : ""}{p.route ? `\nat ${p.route}` : ""}</code></details></div>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div className="dv-help">
        <span>Someone stuck? Send them the simple version:</span>
        <button type="button" className="sx-btn sm" onClick={async () => { try { await navigator.clipboard.writeText(simple); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* the link is visible anyway */ } }}>
          <ICopy size={15} />{copied ? "Copied" : "Copy simple-mode link"}</button>
        <code className="dv-link">{simple.replace(/^https?:\/\//, "")}</code>
      </div>
    </section>
  );
}
