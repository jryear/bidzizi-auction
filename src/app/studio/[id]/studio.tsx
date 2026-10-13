"use client";
// The event Studio: Set up (edit on the guest's phone), Live (control room + stage), Results (wrap-up checklist).
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorText, newId } from "../../../lib/api";
import { ICheck, IChevL, ICopy, IEye, IGrid, IBolt, IMonitor, IShare, ISliders, ITrophy, IWifiOff, IPlay } from "../../../lib/icons";
import { confirm, isConfirmed, type Data, type Item } from "../data";
import { Brand, Menu, Seg, Status, Toast } from "../kit";
import { Canvas, Checklist, Inspector, Outline, useAddItem, useSteps, type Screen, type Sel, type SetupCtx } from "./setup";
import { LiveBoard } from "./live";
import { ResultsBoard } from "./results";
import { ShareDialog } from "./share";
import "../../e/[code]/participant.css";
import "../studio.css";

type Mode = "setup" | "live" | "results";
type Save = "idle" | "saving" | "saved" | "error";

export default function Studio({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false), [offline, setOffline] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [sel, setSel] = useState<Sel>({ kind: "event" });
  const [screen, setScreen] = useState<Screen>("welcome");
  const [pane, setPane] = useState<"steps" | "canvas" | "edit">("canvas");
  const [save, setSave] = useState<Save>("idle");
  const [toast, setToast] = useState<{ text: string; tone: "ink" | "red" | "green" }>({ text: "", tone: "ink" });
  const [sharing, setSharing] = useState(false), [previewed, setPreviewed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((text: string, tone: "ink" | "red" | "green" = "ink") => { setToast({ text, tone }); clearTimeout(timer.current); timer.current = setTimeout(() => setToast({ text: "", tone }), 3600); }, []);

  const reload = useCallback(async () => {
    const r = await api<Data>("GET", `/api/v1/host/events/${eventId}`).catch(() => null);
    if (!r) { setOffline(true); return; }
    if (r.status === 401) { location.href = "/studio"; return; }
    if (r.status === 404) { setMissing(true); return; }
    if (r.ok) { setData(r.data); setOffline(false); }
  }, [eventId]);
  useEffect(() => {
    reload();
    const fast = mode === "live";
    const poll = setInterval(() => { if (document.visibilityState === "visible") reload(); }, fast ? 3000 : 6000);
    return () => clearInterval(poll);
  }, [reload, mode]);
  useEffect(() => { setPreviewed(isConfirmed(eventId, "preview")); }, [eventId]);
  // Pick the mode that fits where the event is (or the one the link asked for); staff can still switch.
  useEffect(() => {
    if (!data || mode) return;
    const asked = new URLSearchParams(location.search).get("mode") as Mode | null;
    setMode(asked && ["setup", "live", "results"].includes(asked) ? asked : data.event.status === "draft" || data.event.phase === "upcoming" ? "setup" : data.event.phase === "open" ? "live" : "results");
  }, [data, mode]);
  const pickMode = (m: Mode) => { setMode(m); history.replaceState(null, "", `?mode=${m}`); window.scrollTo(0, 0); };

  const dataRef = useRef(data); dataRef.current = data;
  const track = useCallback(async (run: () => Promise<{ ok: boolean; message?: string }>) => {
    setSave("saving");
    const result = await run().catch(() => ({ ok: false, message: "Connection lost. That change wasn't saved." }));
    if (result.ok) setSave("saved"); else { setSave("error"); flash(result.message ?? "That change wasn't saved.", "red"); }
    await reload();
    return result.ok;
  }, [flash, reload]);
  const patchEvent = useCallback((fields: Record<string, unknown>) => track(async () => {
    const r = await api("PATCH", `/api/v1/host/events/${eventId}`, { revision: dataRef.current?.event.revision, ...fields });
    return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
  }), [eventId, track]);
  const patchItem = useCallback((item: Item, fields: Record<string, unknown>) => track(async () => {
    const fresh = dataRef.current?.items.find(i => i.id === item.id) ?? item;
    const r = await api("PATCH", `/api/v1/host/items/${item.id}`, { revision: fresh.revision, ...fields });
    return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
  }), [track]);

  const openShare = useCallback(() => { confirm(eventId, "preview"); setPreviewed(true); setSharing(true); }, [eventId]);
  const ctx: SetupCtx | null = data ? { data, reload, flash, patchEvent, patchItem, track, openShare, previewed } : null;
  const select = useCallback((s: Sel, sc?: Screen) => { setSel(s); if (sc) setScreen(sc); }, []);
  const dup = useRef(newId());

  if (missing) return <main className="sx sx-center"><div className="sx-loading"><Brand /><h1>That event isn&rsquo;t here</h1><p>It may belong to another organization, or the link is wrong.</p><a className="sx-btn primary" href="/studio">Back to Studio</a></div></main>;
  if (!data || !mode || !ctx) return <main className="sx sx-center"><div className="sx-loading"><Brand /><span className="dots"><i /><i /><i /></span><p>{offline ? "Can't reach BidZizi. Retrying…" : "Opening your event…"}</p></div></main>;

  const e = data.event;
  const needs = data.items.filter(i => i.phase === "closed" && !i.withdrawn && (i.ready || i.bidCount) && (!i.award || i.award.status === "assigned")).length + data.pledges.filter(p => !p.processedAt).length;
  const goLive = async () => { if (await patchEvent({ status: "live" })) { flash("You're live! Share the code.", "green"); setSharing(true); } };

  return (
    <main className={`sx sx-studio m-${mode}`}>
      <header className="sx-top">
        <a className="sx-icon-btn back" href="/studio" aria-label="All events"><IChevL size={22} /></a>
        <div className="title-block">
          <input className="sx-title" aria-label="Event name" defaultValue={e.name} key={`t-${e.revision}`} maxLength={200}
            onKeyDown={x => { if (x.key === "Enter") (x.target as HTMLInputElement).blur(); }}
            onBlur={x => { const v = x.target.value.trim(); if (v && v !== e.name) patchEvent({ name: v }); else x.target.value = e.name; }} />
          <div className="title-meta">
            <Status stage={e.status === "draft" ? "draft" : e.phase === "open" ? "running" : e.phase === "closed" ? "ended" : "upcoming"} />
            {e.isPractice && <Status stage="practice" />}
            <span className={`save s-${offline ? "error" : save}`} aria-live="polite">{offline ? <><IWifiOff size={14} />Offline. Changes won&rsquo;t save</> : save === "saving" ? "Saving…" : save === "saved" ? <><ICheck size={14} />Saved</> : save === "error" ? "Not saved" : <span className="save-idle">Autosaves</span>}</span>
          </div>
        </div>
        <Seg label="Mode" size="lg" value={mode} onChange={pickMode} options={[
          { id: "setup", label: <><ISliders size={17} /><span>Set up</span></> },
          { id: "live", label: <><IPlay size={16} /><span>Live</span></> },
          { id: "results", label: <><ITrophy size={17} /><span>Results</span></>, badge: needs || undefined },
        ]} />
        <div className="top-acts">
          <a className="sx-btn ghost" href={`/e/${e.code}`} target="_blank" onClick={() => { confirm(e.id, "preview"); setPreviewed(true); }} title={e.status === "draft" ? "Opens on devices signed in to Studio" : "Open the guest app"}><IEye size={18} /><span>Preview</span></a>
          <button type="button" className="sx-btn" onClick={openShare}><IShare size={17} /><span>Share</span><b className="code-chip">{e.code}</b></button>
          {e.status === "draft" ? <button type="button" className="sx-btn primary" onClick={goLive}><IBolt size={17} /><span>Go live</span></button>
            : <a className="sx-btn dark" href={`/studio/${e.id}/stage`} target="_blank"><IMonitor size={17} /><span>Stage</span></a>}
          <Menu label="More actions">
            <button type="button" role="menuitem" onClick={async () => {
              const r = await api("POST", `/api/v1/host/events/${e.id}/duplicate`, { requestId: dup.current }).catch(() => null);
              if (r?.ok) location.href = `/studio/${r.data.id}`; else flash(r ? errorText(r) : "Connection lost.", "red");
            }}><ICopy size={17} />Duplicate as a new draft</button>
            <a role="menuitem" href={`/host/${e.id}`}><IGrid size={17} />Classic workspace</a>
            {e.status === "live" && !data.participants.length && <button type="button" role="menuitem" onClick={() => patchEvent({ status: "draft" })}>Move back to draft</button>}
          </Menu>
        </div>
      </header>

      {mode === "setup" && <SetupMode ctx={ctx} sel={sel} select={select} screen={screen} setScreen={setScreen} pane={pane} setPane={setPane} />}
      {mode === "live" && <LiveBoard ctx={ctx} />}
      {mode === "results" && <ResultsBoard ctx={ctx} />}

      {sharing && <ShareDialog data={data} onClose={() => setSharing(false)} patchEvent={patchEvent} onGoLive={goLive} />}
      <Toast text={toast.text} tone={toast.tone} />
    </main>
  );
}

function SetupMode({ ctx, sel, select, screen, setScreen, pane, setPane }: {
  ctx: SetupCtx; sel: Sel; select: (s: Sel, sc?: Screen) => void; screen: Screen; setScreen: (s: Screen) => void; pane: "steps" | "canvas" | "edit"; setPane: (p: "steps" | "canvas" | "edit") => void;
}) {
  const addItem = useAddItem(ctx, id => { select({ kind: "item", id }, "item"); setPane("canvas"); });
  const steps = useSteps(ctx, (s, sc) => { select(s, sc); setPane(s.kind === "item" || sc ? "canvas" : "edit"); }, addItem);
  return (
    <>
      <div className="pane-tabs"><Seg label="Panel" value={pane} onChange={setPane} options={[{ id: "steps", label: `Steps ${steps.filter(s => s.done).length}/${steps.length}` }, { id: "canvas", label: "Phone" }, { id: "edit", label: "Edit" }]} /></div>
      <div className={`setup p-${pane}`}>
        <aside className="rail-l" aria-label="Checklist and outline">
          <Checklist key={pane === "steps" ? "open" : "closed"} steps={steps} startOpen={pane === "steps"} />
          <Outline ctx={ctx} sel={sel} select={(s, sc) => { select(s, sc); setPane("edit"); }} addItem={addItem} />
        </aside>
        <Canvas ctx={ctx} sel={sel} select={select} screen={screen} setScreen={setScreen} addItem={addItem} />
        <aside className="rail-r" aria-label="Settings for the selection"><Inspector ctx={ctx} sel={sel} select={select} /></aside>
      </div>
    </>
  );
}
