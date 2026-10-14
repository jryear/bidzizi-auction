"use client";
// The event Studio: Set up (edit on the guest's phone), Live (control room + stage), Results (wrap-up checklist).
import { useCallback, useEffect, useRef, useState } from "react";
import type { Snapshot } from "../../e/[code]/model";
import { api, errorText, newId } from "../../../lib/api";
import { ICheck, IChevL, ICopy, IEye, IGrid, IBolt, IMonitor, IShare, ISliders, ITrophy, IWifiOff, IPlay } from "../../../lib/icons";
import { confirm, isConfirmed, type Data, type Item } from "../data";
import { Brand, Menu, Seg, Status, Toast } from "../kit";
import { Canvas, Checklist, Inspector, Outline, selFromUrl, selToUrl, useAddItem, useSteps, type Screen, type Sel, type SetupCtx } from "./setup";
import { ItemsWorkspace } from "./items";
import { startReporting } from "../../../lib/telemetry";
import { LiveBoard } from "./live";
import { ResultsBoard } from "./results";
import { ShareDialog } from "./share";
import { GoLiveDialog } from "./golive";
import "../../e/[code]/participant.css";
import "../studio.css";
import "../items.css";

type Mode = "setup" | "live" | "results";
type Save = "idle" | "editing" | "saving" | "saved" | "error";

export default function Studio({ eventId }: { eventId: string }) {
  const [preview, setPreview] = useState<Snapshot | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false), [offline, setOffline] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [sel, setSel] = useState<Sel>({ kind: "event" });
  const [screen, setScreen] = useState<Screen>("welcome");
  const [pane, setPane] = useState<"steps" | "canvas" | "edit">("canvas");
  const [save, setSave] = useState<Save>("idle");
  const [title, setTitle] = useState<string | null>(null);
  const titleGeneration = useRef(0);
  const dataRef = useRef<Data | null>(null);
  const loadId = useRef(0), writeEpoch = useRef(0), pendingSaves = useRef(0);
  const dirtyFields = useRef(new Set<string>()), saveFailed = useRef(false);
  const showSave = useCallback(() => {
    setSave(saveFailed.current ? "error" : pendingSaves.current ? "saving" : dirtyFields.current.size ? "editing" : "saved");
  }, []);
  useEffect(() => {
    if (!dirtyFields.current.has("header:name")) setTitle(data?.event.name ?? null);
  }, [data?.event.name]);
  const [toast, setToast] = useState<{ text: string; tone: "ink" | "red" | "green" }>({ text: "", tone: "ink" });
  const [sharing, setSharing] = useState(false), [previewed, setPreviewed] = useState(false), [checking, setChecking] = useState(false), [addRequest, setAddRequest] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((text: string, tone: "ink" | "red" | "green" = "ink") => { setToast({ text, tone }); clearTimeout(timer.current); timer.current = setTimeout(() => setToast({ text: "", tone }), 3600); }, []);

  const reload = useCallback(async () => {
    const requestId = ++loadId.current, epoch = writeEpoch.current;
    const [r, p] = await Promise.all([
      api<Data>("GET", `/api/v1/host/events/${eventId}`).catch(() => null),
      api<Snapshot>("GET", `/api/v1/host/events/${eventId}/preview`).catch(() => null),
    ]);
    // A poll started before a save must not replace that save's acknowledged state.
    if (requestId !== loadId.current || epoch !== writeEpoch.current) return;
    if (p?.ok) setPreview(p.data);
    if (!r) { setOffline(true); return; }
    if (r.status === 401) { location.href = "/studio"; return; }
    if (r.status === 404) { setMissing(true); return; }
    if (r.ok) { dataRef.current = r.data; setData(r.data); setOffline(false); }
  }, [eventId]);
  useEffect(() => {
    reload();
    const fast = mode === "live";
    const poll = setInterval(() => { if (document.visibilityState === "visible" && !pendingSaves.current) reload(); }, fast ? 3000 : 6000);
    return () => clearInterval(poll);
  }, [reload, mode]);
  useEffect(() => { setPreviewed(isConfirmed(eventId, "preview")); }, [eventId]);
  useEffect(() => startReporting({ url: "/api/v1/host/telemetry", eventId }), [eventId]);
  // Pick the mode that fits where the event is (or the one the link asked for); staff can still switch.
  useEffect(() => {
    if (!data || mode) return;
    const asked = new URLSearchParams(location.search).get("mode") as Mode | null;
    setMode(asked && ["setup", "live", "results"].includes(asked) ? asked : data.event.status === "draft" || data.event.phase === "upcoming" ? "setup" : data.event.phase === "open" ? "live" : "results");
  }, [data, mode]);
  const pickMode = (m: Mode) => { setMode(m); history.replaceState(null, "", `?mode=${m}${m === "setup" ? selToUrl(sel) : ""}`); window.scrollTo(0, 0); };

  // Acknowledgements update dataRef synchronously, before the next queued edit can start.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const track = useCallback((run: () => Promise<{ ok: boolean; message?: string }>) => {
    pendingSaves.current++;
    showSave();
    const next = queue.current.then(async () => {
      writeEpoch.current++;
      const result = await run().catch(() => ({ ok: false, message: "Connection lost. That change wasn't saved." }));
      saveFailed.current = !result.ok;
      if (!result.ok) flash(result.message ?? "That change wasn't saved.", "red");
      await reload();
      pendingSaves.current--;
      showSave();
      return result.ok;
    });
    queue.current = next.catch(() => {});
    return next;
  }, [flash, reload, showSave]);
  useEffect(() => {
    const on = (ev: Event) => {
      const { field, dirty } = (ev as CustomEvent<{ field: string; dirty: boolean }>).detail;
      if (dirty) dirtyFields.current.add(field); else dirtyFields.current.delete(field);
      showSave();
    };
    addEventListener("bz:editing", on); return () => removeEventListener("bz:editing", on);
  }, [showSave]);
  const patchEvent = useCallback((fields: Record<string, unknown>) => track(async () => {
    const r = await api("PATCH", `/api/v1/host/events/${eventId}`, { revision: dataRef.current?.event.revision, ...fields });
    if (r.ok && dataRef.current) {
      const next = { ...dataRef.current, event: { ...dataRef.current.event, ...fields, revision: r.data.revision } };
      dataRef.current = next; setData(next);
    }
    return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
  }), [eventId, track]);
  const patchItem = useCallback((item: Item, fields: Record<string, unknown>) => track(async () => {
    const fresh = dataRef.current?.items.find(i => i.id === item.id) ?? item;
    const r = await api("PATCH", `/api/v1/host/items/${item.id}`, { revision: fresh.revision, ...fields });
    if (r.ok && dataRef.current) {
      const next = { ...dataRef.current, items: dataRef.current.items.map(i => i.id === item.id ? { ...i, ...fields, revision: r.data.revision } : i) };
      dataRef.current = next; setData(next);
    }
    return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
  }), [track]);

  // Optimistic local changes (a drag-reorder) show at once; polls that started earlier are discarded.
  const apply = useCallback((change: (d: Data) => Data) => {
    if (!dataRef.current) return;
    writeEpoch.current++;
    const next = change(dataRef.current);
    dataRef.current = next; setData(next);
  }, []);
  const current = useCallback(() => dataRef.current!, []);
  const openShare = useCallback(() => { confirm(eventId, "preview"); setPreviewed(true); setSharing(true); }, [eventId]);
  const ctx: SetupCtx | null = data ? { preview, data, reload, flash, patchEvent, patchItem, track, apply, current, openShare, previewed } : null;
  // The Items workspace and the open item live in the URL, so reload and Back return to the same place.
  const selRef = useRef<Sel>(sel); selRef.current = sel;
  const select = useCallback((s: Sel, sc?: Screen) => {
    const url = `?mode=setup${selToUrl(s)}${sc ? `&screen=${sc}` : ""}`, workspace = (x: Sel) => x.kind === "items" || x.kind === "item";
    if (url !== location.search) {
      if (workspace(s) !== workspace(selRef.current)) history.pushState(null, "", url); else history.replaceState(null, "", url);
    }
    selRef.current = s; setSel(s);
    if (sc) setScreen(sc);
  }, []);
  useEffect(() => {
    const fromUrl = (): void => {
      const next = selFromUrl(location.search);
      setSel(next?.sel ?? { kind: "event" });
      if (next?.screen) setScreen(next.screen);
    };
    if (selFromUrl(location.search)) fromUrl();
    addEventListener("popstate", fromUrl); return () => removeEventListener("popstate", fromUrl);
  }, []);
  const dup = useRef(newId());

  if (missing) return <main className="sx sx-center"><div className="sx-loading"><Brand /><h1>That event isn&rsquo;t here</h1><p>It may belong to another organization, or the link is wrong.</p><a className="sx-btn primary" href="/studio">Back to Studio</a></div></main>;
  if (!data || !mode || !ctx) return <main className="sx sx-center"><div className="sx-loading"><Brand /><span className="dots"><i /><i /><i /></span><p>{offline ? "Can't reach BidZizi. Retrying…" : "Opening your event…"}</p></div></main>;

  const e = data.event;
  const needs = data.items.filter(i => i.phase === "closed" && !i.withdrawn && (i.ready || i.bidCount) && (!i.award || i.award.status === "assigned")).length + data.pledges.filter(p => !p.processedAt).length;
  const goLive = async () => { const ok = await patchEvent({ status: "live" }); if (ok) { flash("You're live! Share the code.", "green"); setSharing(true); } return ok; };
  const askGoLive = () => { setSharing(false); setChecking(true); };

  return (
    <main className={`sx sx-studio m-${mode}`}>
      <header className="sx-top">
        <a className="sx-icon-btn back" href="/studio" aria-label="All events"><IChevL size={22} /></a>
        <div className="title-block">
          <input className="sx-title" aria-label="Event name" value={title ?? e.name} maxLength={200}
            onChange={x => { titleGeneration.current++; setTitle(x.target.value); dirtyFields.current.add("header:name"); showSave(); }}
            onKeyDown={x => { if (x.key === "Enter") (x.target as HTMLInputElement).blur(); }}
            onBlur={async x => {
              const v = x.target.value.trim(), version = titleGeneration.current;
              const savedName = dataRef.current?.event.name ?? e.name;
              if (v && v !== savedName) {
                if (await patchEvent({ name: v }) && titleGeneration.current === version) { dirtyFields.current.delete("header:name"); setTitle(v); }
              } else { setTitle(savedName); dirtyFields.current.delete("header:name"); }
              showSave();
            }} />
          <div className="title-meta">
            <span className={`vis-pill is-${e.status}`} title={e.status === "draft" ? "Guests can't see this event yet" : "Guests see every change as soon as it saves"}>
              <i aria-hidden="true" /><b>{e.status === "draft" ? "Draft" : "Live"}</b><span className="vp-more"> · {e.status === "draft" ? "only you can see this" : "changes appear to guests instantly"}</span></span>
            {e.isPractice && <Status stage="practice" />}
            <span className={`save s-${offline ? "error" : save}`} aria-live="polite">{offline ? <><IWifiOff size={14} />Offline. Changes won&rsquo;t save</> : save === "editing" ? "Unsaved changes" : save === "saving" ? <><span className="spin" aria-hidden="true" />Saving…</> : save === "error" ? "Not saved" : <><ICheck size={14} />Saved</>}</span>
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
          {e.status === "draft" ? <button type="button" className="sx-btn primary" onClick={askGoLive}><IBolt size={17} /><span>Go live</span></button>
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

      {mode === "setup" && <SetupMode ctx={ctx} sel={sel} select={select} screen={screen} setScreen={sc => { setScreen(sc); history.replaceState(null, "", `?mode=setup${selToUrl(sel)}&screen=${sc}`); }} pane={pane} setPane={setPane} addRequest={addRequest} />}
      {mode === "live" && <LiveBoard ctx={ctx} />}
      {mode === "results" && <ResultsBoard ctx={ctx} />}

      {sharing && <ShareDialog data={data} onClose={() => setSharing(false)} patchEvent={patchEvent} onGoLive={askGoLive} />}
      {checking && <GoLiveDialog data={data} onGoLive={goLive} onClose={() => setChecking(false)}
        onFix={(s, sc) => { pickMode("setup"); select(s, sc); setPane(sc ? "canvas" : "edit"); }}
        onAdd={() => { pickMode("setup"); setAddRequest(n => n + 1); }} />}
      <Toast text={toast.text} tone={toast.tone} />
    </main>
  );
}

function SetupMode({ ctx, sel, select, screen, setScreen, pane, setPane, addRequest }: {
  ctx: SetupCtx; sel: Sel; select: (s: Sel, sc?: Screen) => void; screen: Screen; setScreen: (s: Screen) => void; pane: "steps" | "canvas" | "edit"; setPane: (p: "steps" | "canvas" | "edit") => void; addRequest: number;
}) {
  const addItem = useAddItem(ctx, id => { select({ kind: "item", id }, "item"); setPane("canvas"); });
  // Adding items happens in the Items workspace: its add row is ready to type into.
  const openAdd = useCallback(() => select({ kind: "items", focus: "add" }), [select]);
  const handled = useRef(addRequest);
  useEffect(() => { if (addRequest !== handled.current) { handled.current = addRequest; openAdd(); } }, [addRequest, openAdd]);
  const steps = useSteps(ctx, (s, sc) => { select(s, sc); setPane(s.kind === "item" || sc ? "canvas" : "edit"); }, openAdd);
  if (sel.kind === "items") return <ItemsWorkspace ctx={ctx} sel={sel} select={(s, sc) => { select(s, sc); if (s.kind === "item") setPane(innerWidth <= 1080 ? "edit" : "canvas"); }} />;
  return (
    <>
      <div className="pane-tabs"><Seg label="Panel" value={pane} onChange={setPane} options={[{ id: "steps", label: `Steps ${steps.filter(s => s.done).length}/${steps.length}` }, { id: "canvas", label: "Phone" }, { id: "edit", label: "Edit" }]} /></div>
      <div className={`setup p-${pane}`}>
        <aside className="rail-l" aria-label="Checklist and outline">
          <Checklist key={pane === "steps" ? "open" : "closed"} steps={steps} startOpen={pane === "steps"} />
          <Outline ctx={ctx} sel={sel} select={(s, sc) => { select(s, sc); setPane(s.kind === "items" ? pane : "edit"); }} addItem={openAdd} />
        </aside>
        <Canvas ctx={ctx} sel={sel} select={select} screen={screen} setScreen={setScreen} addItem={addItem} />
        <aside className="rail-r" aria-label="Settings for the selection"><Inspector ctx={ctx} sel={sel} select={select} /></aside>
      </div>
    </>
  );
}
