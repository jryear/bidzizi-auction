"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dollarsInput, errorText, fmtClock, fmtTime, fromLocalInput, newId, parseDollars, toLocalInput, untilText } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { THEMES } from "../../../lib/templates";
import "../studio-design.css";
import { EventOperations } from "../event-operations";
import { PhotoPicker, StageChip } from "../../host/ui";
import { Bidding, Donations, DuplicateButton, People, ResultRow, Share, Sponsors, type Ctx, type Data, type Item } from "../../host/[id]/workspace";

type Mode = "setup" | "live" | "results";
type Selection = { kind: "event" } | { kind: "item"; id: string } | { kind: "donations" } | { kind: "sponsors" } | { kind: "rules" };
type SaveState = "idle" | "saving" | "saved" | "error";

export default function Studio({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);
  const [sel, setSel] = useState<Selection>({ kind: "event" });
  const select = useCallback((s:Selection)=>{setSel(s);if(window.matchMedia("(max-width:760px)").matches)setTimeout(()=>document.querySelector(".inspector")?.scrollIntoView({behavior:"smooth",block:"start"}),0);},[]);
  const [save, setSave] = useState<SaveState>("idle");
  const [error,setError]=useState("");
  const [toast, setToast] = useState(""), [sharing, setSharing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((text: string) => { setToast(text); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(""), 3500); }, []);
  const reload = useCallback(async () => {
    const r = await api<Data>("GET", `/api/v1/host/events/${eventId}`).catch(() => null);
    if (r?.status === 401) { location.href = "/studio"; return; }
    if (r?.ok) { setData(r.data); setError(""); } else setError(r ? errorText(r) : "Connection lost. The view may be out of date. Retrying…");
  }, [eventId]);
  useEffect(() => {
    reload();
    const poll = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 5000);
    return () => clearInterval(poll);
  }, [reload]);
  // Pick the mode that fits where the event is; staff can still switch.
  useEffect(() => {
    if (!data || mode) return;
    setMode(data.event.status === "draft" || data.event.phase === "upcoming" ? "setup" : data.event.phase === "open" ? "live" : "results");
  }, [data, mode]);

  const track = useCallback(async (run: () => Promise<{ ok: boolean; message?: string }>) => {
    setSave("saving");
    const result = await run().catch(() => ({ ok: false, message: "Connection lost. Check the latest view before retrying this change." }));
    if (result.ok) { setSave("saved"); } else { setSave("error"); flash(result.message ?? "That change wasn't saved."); }
    await reload();
    return result.ok;
  }, [flash, reload]);
  const patchEvent = useCallback((fields: Record<string, unknown>) => track(async () => {
    const r = await api("PATCH", `/api/v1/host/events/${eventId}`, { revision: data?.event.revision, ...fields });
    return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
  }), [data?.event.revision, eventId, track]);
  const patchItem = useCallback((item: Item, fields: Record<string, unknown>) => track(async () => {
    const r = await api("PATCH", `/api/v1/host/items/${item.id}`, { revision: item.revision, ...fields });
    return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
  }), [track]);

  if (!data || !mode) return <main className="studio"><p className="muted" style={{ padding: 32 }}>{error || "Opening your event…"}</p></main>;
  const ctx: Ctx = { data, reload, flash, patchEvent };
  const e = data.event;
  const needsWinner = data.items.filter(i => i.phase === "closed" && i.ready && !i.withdrawn && !i.award).length;

  return (
    <main className="studio">
      <header className="studio-top">
        <a className="btn ghost small" href="/studio">← Studio</a>
        <input className="title-input" aria-label="Event name" defaultValue={e.name} key={`name-${e.revision}`}
          onBlur={x => { if (x.target.value.trim() && x.target.value !== e.name) patchEvent({ name: x.target.value }); }} />
        <StageChip stage={e.status === "draft" ? "draft" : e.phase} />
        {e.isPractice && <span className="chip pending">Practice</span>}
        <span className={`save-state ${save}`}>{{ idle: "", saving: "Saving…", saved: "All changes saved", error: "Save not confirmed" }[save]}</span>
        <span className="grow" />
        <div className="modes" role="tablist" aria-label="Mode">
          {(["setup", "live", "results"] as Mode[]).map(m => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>
              {{ setup: "Set up", live: "Live", results: "Results" }[m]}{m === "results" && needsWinner ? <span className="count">{needsWinner}</span> : null}
            </button>
          ))}
        </div>
        <a className="btn small" href={`/e/${e.code}`} target="_blank">Preview ↗</a>

        <button className="btn small" onClick={() => setSharing(true)}>Share · {e.code}</button>
        {e.status === "draft" && <button className="btn primary small" onClick={async () => { if (await patchEvent({ status: "live" })) { flash("You're live! Share your code."); setSharing(true); } }}>Go live</button>}
      </header>

      {error && <p className="notice warn studio-error" role="status">{error}</p>}
      {mode === "setup" && (
        <div className="studio-body">
          <Checklist data={data} select={select} onShare={() => setSharing(true)} />
          <Canvas data={data} sel={sel} select={select} reload={reload} flash={flash} patchEvent={patchEvent} />
          <aside className="inspector" aria-label="Settings for the selected element">
            {sel.kind === "event" && <EventInspector ctx={ctx} patchEvent={patchEvent} />}
            {sel.kind === "item" && (() => { const item = data.items.find(i => i.id === sel.id); return item ? <ItemInspector key={item.id + item.revision} item={item} data={data} patchItem={patchItem} reload={reload} flash={flash} onDeleted={() => setSel({ kind: "event" })} /> : null; })()}
            {sel.kind === "donations" && <DonationsInspector ctx={ctx} />}
            {sel.kind === "sponsors" && <><h3>Sponsors</h3><Sponsors ctx={ctx} /></>}
            {sel.kind === "rules" && <Bidding ctx={ctx} />}
          </aside>
        </div>
      )}
      {mode === "live" && <LiveBoard ctx={ctx} />}
      {mode === "results" && <ResultsBoard ctx={ctx} />}

      {sharing && <ShareDialog ctx={ctx} onClose={() => setSharing(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

// ---------------------------------------------------------------- checklist

function Checklist({ data, select, onShare }: { data: Data; select: (s: Selection) => void; onShare: () => void }) {
  const e = data.event;
  const [reviewed,setReviewed]=useState("");
  const scheduleKey=`${e.startsAt}/${e.endsAt}`;
  const firstNoPhoto = data.items.find(i => !i.imageUrl);
  const steps: { label: string; done: boolean; go: () => void }[] = [
    { label: "Add a cover photo", done: Boolean(e.coverUrl), go: () => select({ kind: "event" }) },
    { label: "Write a welcome message", done: Boolean(e.welcome.trim()), go: () => select({ kind: "event" }) },
    { label: `Add 3+ items (${data.items.length})`, done: data.items.length >= 3, go: () => document.getElementById("add-item")?.click() },
    { label: "Give every item a photo", done: data.items.length > 0 && !firstNoPhoto, go: () => firstNoPhoto && select({ kind: "item", id: firstNoPhoto.id }) },
    { label: "Check the schedule", done: reviewed === scheduleKey, go: () => {select({ kind: "event" }); setReviewed(scheduleKey);} },
    { label: e.status === "live" ? "You're live — share your code" : "Go live & share your code", done: e.status === "live", go: onShare },
  ];
  const done = steps.filter(s => s.done).length;
  return (
    <aside className="checklist" aria-label="Setup checklist">
      <div className="stack" style={{ gap: 4 }}>
        <b>Get ready</b>
        <div className="progress" aria-label={`${done} of ${steps.length} done`}><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      </div>
      {steps.map(s => (
        <button key={s.label} className={`step${s.done ? " done" : ""}`} onClick={s.go}>
          <span className="tick" aria-hidden="true">{s.done ? "✓" : ""}</span>{s.label}
        </button>
      ))}
      <div className="stack" style={{ gap: 6, marginTop: 12 }}>
        <span className="small faint">More</span>
        <button className="step" onClick={() => select({ kind: "rules" })}><span className="tick" />Bid increments</button>
        <button className="step" onClick={() => select({ kind: "donations" })}><span className="tick" />Donations</button>
        <button className="step" onClick={() => select({ kind: "sponsors" })}><span className="tick" />Sponsors</button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- canvas (the attendee's phone, editable)

function Canvas({ data, sel, select, reload, flash, patchEvent }: { data: Data; sel: Selection; select: (s: Selection) => void; reload: () => Promise<void>; flash: (t: string) => void; patchEvent: (f: Record<string, unknown>) => Promise<boolean> }) {
  const e = data.event;
  const [dragging, setDragging] = useState<string | null>(null);
  const request = useRef(newId());
  const isSel = (s: Selection) => JSON.stringify(s) === JSON.stringify(sel);
  async function addItem() {
    const r = await api("POST", `/api/v1/host/events/${e.id}/items`, { requestId: request.current, title: "New item", openingMinor: 10_000 }).catch(() => null);
    if (!r?.ok) { flash(r ? errorText(r) : "Connection lost."); return; }
    request.current = newId();
    await reload();
    select({ kind: "item", id: r.data.id });
  }
  async function drop(targetId: string) {
    if (!dragging || dragging === targetId) return;
    const order = data.items.map(i => i.id).filter(x => x !== dragging);
    order.splice(order.indexOf(targetId), 0, dragging);
    setDragging(null);
    const r = await api("POST", `/api/v1/host/events/${e.id}/items/order`, { order }).catch(() => null);
    if (r && !r.ok) flash(errorText(r));
    reload();
  }
  return (
    <section className="canvas" aria-label="Your event as attendees see it">
      <div className="themes" role="radiogroup" aria-label="Theme">
        {THEMES.map(t => (
          <button key={t.id} role="radio" aria-checked={e.theme === t.id} title={t.name} onClick={() => patchEvent({ theme: t.id })} style={{ background: `linear-gradient(135deg, ${t.ink} 50%, ${t.accent} 50%)` }}>
            <span className="sr">{t.name}</span>
          </button>
        ))}
      </div>
      <div className="device phone" data-theme={e.theme}>
        <div className="pass">
          <span className="mono">YB</span>
          <div className="who"><b>Your Business</b><span>A participant</span></div>
          <span className="event">{e.name}</span>
        </div>
        <div className="screen" style={{ paddingBottom: 24 }}>
          <button className={`editable cover${isSel({ kind: "event" }) ? " selected" : ""}`} onClick={() => select({ kind: "event" })} aria-label="Edit cover and event details">
            {e.coverUrl ? <img src={e.coverUrl} alt="" /> : <span className="placeholder">Your event.<br />Your community.<br /><small>Add a cover photo ↗</small></span>}
          </button>
          <button className={`editable text-block${isSel({ kind: "event" }) ? " selected" : ""}`} onClick={() => select({ kind: "event" })}>
            <span className="small faint">{fmtTime(e.startsAt, e.timezone)}{e.venue ? ` · ${e.venue}` : ""}</span>
            <h1>{e.name}</h1>
            {e.welcome ? <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{e.welcome}</p> : <p className="placeholder-text">Add a welcome message</p>}
          </button>
          {data.sponsors.length > 0 ? (
            <button className={`editable${isSel({ kind: "sponsors" }) ? " selected" : ""}`} onClick={() => select({ kind: "sponsors" })}>
              <div className="sponsors">{data.sponsors.map(s => <span className="sp" key={s.id}>{s.logoUrl && <img src={s.logoUrl} alt="" />}{s.name}</span>)}</div>
            </button>
          ) : null}
          {data.items.map(item => (
            <div key={item.id} draggable onDragStart={() => setDragging(item.id)} onDragOver={x => x.preventDefault()} onDrop={() => drop(item.id)}
              className={`drag-wrap${dragging === item.id ? " dragging" : ""}`}>
              <button className={`lot editable${isSel({ kind: "item", id: item.id }) ? " selected" : ""}${!item.ready ? " hidden-item" : ""}`} onClick={() => select({ kind: "item", id: item.id })}>
                <span className="thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <span aria-label="No photo">{String(item.position+1).padStart(2,"0")}</span>}</span>
                <span className="stack" style={{ gap: 4, minWidth: 0, textAlign: "left" }}>
                  <h3>{item.title}</h3>
                  <span className="price"><span className="money">{formatMoney(item.currentMinor ?? item.openingMinor)}</span><span className="small faint">{item.bidCount ? `${item.bidCount} bids` : "starting"}</span></span>
                  {!item.ready ? <span className="chip draft">Hidden</span> : item.short ? <span className="small muted">{item.short}</span> : null}
                </span>
              </button>
            </div>
          ))}
          <button id="add-item" className="add-card" onClick={addItem}>+ Add item</button>
          <button className={`editable donate-card${isSel({ kind: "donations" }) ? " selected" : ""}`} onClick={() => select({ kind: "donations" })}>
            {e.donationsEnabled ? <><b>Donate</b><span className="small muted">{data.recipients.map(r => r.name).join(" · ") || "Add a nonprofit"}</span></> : <span className="placeholder-text">+ Add donations (optional)</span>}
          </button>
          {data.sponsors.length === 0 && <button className="add-card" onClick={() => select({ kind: "sponsors" })}>+ Add sponsors (optional)</button>}
        </div>
      </div>
      <p className="small faint" style={{ textAlign: "center" }}>Click anything to edit it. Drag items to reorder.</p>
    </section>
  );
}

// ---------------------------------------------------------------- inspectors

function EventInspector({ ctx, patchEvent }: { ctx: Ctx; patchEvent: (f: Record<string, unknown>) => Promise<boolean> }) {
  const e = ctx.data.event, tz = e.timezone;
  const commit = (field: string, value: unknown, current: unknown) => { if (value !== current) patchEvent({ [field]: value }); };
  return (
    <div className="stack" key={e.revision}>
      <h3>Event</h3>
      <PhotoPicker label="Cover photo" url={e.coverUrl} onChange={a => patchEvent({ coverAssetId: a?.id ?? null })} />
      <label className="field"><span>Name</span><input defaultValue={e.name} onBlur={x => x.target.value.trim() && commit("name", x.target.value, e.name)} /></label>
      <label className="field"><span>Welcome message</span><textarea defaultValue={e.welcome} placeholder="Welcome! Browse the items and bid from your phone." onBlur={x => commit("welcome", x.target.value, e.welcome)} /></label>
      <label className="field"><span>Where</span><input defaultValue={e.venue} placeholder="Venue or address" onBlur={x => commit("venue", x.target.value, e.venue)} /></label>
      <label className="field"><span>Bidding opens</span><input type="datetime-local" defaultValue={toLocalInput(e.startsAt, tz)} disabled={e.hasBids} onBlur={x => { const v = fromLocalInput(x.target.value, tz); if (v && new Date(v).getTime() !== new Date(e.startsAt).getTime()) patchEvent({ startsAt: v }); }} /></label>
      <label className="field"><span>Bidding closes</span><input type="datetime-local" defaultValue={toLocalInput(e.endsAt, tz)} onBlur={x => { const v = fromLocalInput(x.target.value, tz); if (v && new Date(v).getTime() !== new Date(e.endsAt).getTime()) patchEvent({ endsAt: v }); }} /></label>
      <label className="field"><span>Message to winners</span><textarea defaultValue={e.winnerInstructions} placeholder="Congratulations! Pick up your item at the front desk." onBlur={x => commit("winnerInstructions", x.target.value, e.winnerInstructions)} /></label>
      <details className="advanced">
        <summary>Advanced</summary>
        <div className="stack">
          <label className="field"><span>Time zone</span><input defaultValue={tz} onBlur={x => commit("timezone", x.target.value, tz)} /></label>
          <label className="field"><span>People can come back to see results until</span><input type="datetime-local" defaultValue={toLocalInput(e.accessEndsAt, tz)} onBlur={x => { const v = fromLocalInput(x.target.value, tz); if (v && new Date(v).getTime() !== new Date(e.accessEndsAt).getTime()) patchEvent({ accessEndsAt: v }); }} /></label>
          <label className="check"><input type="checkbox" checked={e.entryOpen} onChange={x => patchEvent({ entryOpen: x.target.checked })} /> New people can join</label>
          {e.status === "live" && !ctx.data.participants.length && <button className="btn small" onClick={() => patchEvent({ status: "draft" })}>Move back to draft</button>}
        </div>
      </details>
      <p className="hint">Draft preview works on devices signed in to your staff account.</p>
      <details className="advanced"><summary>Make a copy</summary><p className="hint">Copy the setup and items into a new draft.</p><DuplicateButton eventId={e.id} /></details>
      <EventOperations ctx={ctx} />
    </div>
  );
}

function ItemInspector({ item, data, patchItem, reload, flash, onDeleted }: { item: Item; data: Data; patchItem: (i: Item, f: Record<string, unknown>) => Promise<boolean>; reload: () => Promise<void>; flash: (t: string) => void; onDeleted: () => void }) {
  const tz = data.event.timezone, locked = item.hasBids ?? item.bids.length > 0;
  const commit = (field: string, value: unknown, current: unknown) => { if (value !== current) patchItem(item, { [field]: value }); };
  return (
    <div className="stack">
      <div className="row between"><h3>Item</h3>{item.bidCount > 0 && <span className="chip live">{item.bidCount} bids</span>}</div>
      <PhotoPicker url={item.imageUrl} onChange={a => patchItem(item, { imageAssetId: a?.id ?? null })} />
      <label className="field"><span>Title</span><input defaultValue={item.title} autoFocus={item.title === "New item"} onFocus={x => item.title === "New item" && x.target.select()} onBlur={x => x.target.value.trim() && commit("title", x.target.value, item.title)} /></label>
      <label className="field"><span>Starting bid</span><input inputMode="decimal" defaultValue={dollarsInput(item.openingMinor)} disabled={locked}
        onBlur={x => { const v = parseDollars(x.target.value); if (v) commit("openingMinor", v, item.openingMinor); else flash("Enter an amount like 150 or 150.00"); }} /></label>
      {locked && <p className="hint">The starting bid locks once someone bids.</p>}
      <label className="field"><span>One-line summary</span><input defaultValue={item.short} placeholder="Two nights for four" onBlur={x => commit("short", x.target.value, item.short)} /></label>
      <label className="field"><span>Description</span><textarea defaultValue={item.description} onBlur={x => commit("description", x.target.value, item.description)} /></label>
      <div className="grid2">
        <label className="field"><span>Category</span><input defaultValue={item.category} onBlur={x => commit("category", x.target.value, item.category)} /></label>
        <label className="field"><span>Provided by</span><input defaultValue={item.donor} onBlur={x => commit("donor", x.target.value, item.donor)} /></label>
      </div>
      <details className="advanced">
        <summary>Advanced</summary>
        <div className="stack">
          <label className="field"><span>Raise each bid by</span><input inputMode="decimal" disabled={locked} placeholder="Event default" defaultValue={item.incrementOverrideMinor ? dollarsInput(item.incrementOverrideMinor) : ""}
            onBlur={x => { const v = x.target.value ? parseDollars(x.target.value) : null; if (x.target.value && !v) return; commit("incrementOverrideMinor", v, item.incrementOverrideMinor); }} /></label>
          <label className="field"><span>Opens (blank = event start)</span><input type="datetime-local" disabled={locked} defaultValue={toLocalInput(item.opensAt, tz)} onBlur={x => commit("opensAt", fromLocalInput(x.target.value, tz), item.opensAt)} /></label>
          <label className="field"><span>Closes (blank = event close)</span><input type="datetime-local" defaultValue={toLocalInput(item.closesAt, tz)} onBlur={x => commit("closesAt", fromLocalInput(x.target.value, tz), item.closesAt)} /></label>
          <label className="check"><input type="checkbox" checked={item.ready} disabled={locked} onChange={x => patchItem(item, { ready: x.target.checked })} /> Visible to participants</label>
          <button className="btn danger small" disabled={locked} onClick={async () => {
            if (!confirm(`Delete "${item.title}"?`)) return;
            const r = await api("DELETE", `/api/v1/host/items/${item.id}`).catch(() => null);
            if (r?.ok) { onDeleted(); reload(); } else flash(r ? errorText(r) : "Connection lost.");
          }}>Delete item</button>
        </div>
      </details>
    </div>
  );
}

function DonationsInspector({ ctx }: { ctx: Ctx }) {
  const { data, patchEvent, reload, flash } = ctx, e = data.event;
  const [name, setName] = useState("");
  return (
    <div className="stack">
      <h3>Donations</h3>
      <label className="check"><input type="checkbox" checked={e.donationsEnabled} onChange={x => patchEvent({ donationsEnabled: x.target.checked })} /> Let people donate to nonprofits</label>
      <p className="hint">Quick amounts $25, $50, $100, or any amount up to $10,000.</p>
      {data.recipients.map(r => (
        <div key={r.id} className="row between"><span>{r.name}</span>
          <button className="btn small ghost" onClick={async () => { await api("DELETE", `/api/v1/host/events/${e.id}/recipients/${r.id}`).catch(() => null); reload(); }}>Remove</button></div>
      ))}
      <form className="row" onSubmit={async x => { x.preventDefault(); if (!name.trim()) return;
        const r = await api("POST", `/api/v1/host/events/${e.id}/recipients`, { name }).catch(() => null);
        if (r?.ok) { setName(""); reload(); } else flash(r ? errorText(r) : "Connection lost."); }}>
        <input className="input" value={name} onChange={x => setName(x.target.value)} placeholder="Add a nonprofit, e.g. Red Cross" />
        <button className="btn small">Add</button>
      </form>
      <details className="advanced">
        <summary>Advanced</summary>
        <label className="field"><span>Donations close</span><input type="datetime-local" defaultValue={toLocalInput(e.donationDeadline ?? e.endsAt, e.timezone)}
          onBlur={x => { const v = fromLocalInput(x.target.value, e.timezone); if (v) patchEvent({ donationDeadline: v }); }} /></label>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------- live mode

function LiveBoard({ ctx }: { ctx: Ctx }) {
  const { data } = ctx, e = data.event, now = new Date(data.serverNow).getTime();
  const [focus, setFocus] = useState<string | null>(null);
  const [query,setQuery]=useState("");
  useEffect(()=>{if(focus&&window.matchMedia("(max-width:760px)").matches)setTimeout(()=>document.querySelector(".board-side")?.scrollIntoView({behavior:"smooth",block:"start"}),0);},[focus]);
  const titles = useMemo(() => new Map(data.items.map(i => [i.id, i.title])), [data.items]);
  const focused = data.items.find(i => i.id === focus);
  const total = data.items.filter(i=>!i.withdrawn).reduce((s, i) => s + (i.currentMinor ?? 0), 0);
  return (
    <div className="board">
      <div className="board-main">
        <div className="stats4">
          <div className="card stat"><span className="small faint">{e.phase === "open" ? "Time left" : e.phase === "upcoming" ? "Starts in" : "Status"}</span><b>{e.phase === "open" ? untilText(e.endsAt, now) : e.phase === "upcoming" ? untilText(e.startsAt, now) : "Ended"}</b></div>
          <div className="card stat"><span className="small faint">People joined</span><b>{data.participants.length}</b></div>
          <div className="card stat"><span className="small faint">Bids</span><b>{data.items.reduce((s, i) => s + i.bidCount, 0)}</b></div>
          <div className="card stat"><span className="small faint">Raised so far</span><b>{formatMoney(total)}</b></div>
        </div>
        <label className="field"><span>Find an item</span><input type="search" value={query} onChange={x=>setQuery(x.target.value)} placeholder="Item title or number" /></label>
        <div className="tiles">
          {data.items.filter(i => i.ready && (!query || `${i.title} ${i.position+1}`.toLowerCase().includes(query.toLowerCase()))).map(i => (
            <button key={i.id} className={`tile card${focus === i.id ? " selected" : ""}`} onClick={() => setFocus(i.id)}>
              <span className="tile-img">{i.imageUrl ? <img src={i.imageUrl} alt="" /> : <span>{String(i.position+1).padStart(2,"0")}</span>}</span>
              <span className="pad stack" style={{ gap: 4, textAlign: "left" }}>
                <b>{i.title}</b>
                <span className="money" style={{ fontSize: 22 }}>{formatMoney(i.currentMinor ?? i.openingMinor)}</span>
                <span className="small muted">{i.leader ? `${i.leader.name} · ${i.leader.business}` : "No bids yet"}</span>
                <span className="row between small"><StageChip stage={i.withdrawn ? "Withdrawn" : i.phase} />{i.phase === "open" && <span className="faint">{untilText(i.effectiveClosesAt, now)}</span>}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      <aside className="board-side stack">
        {focused ? (
          <div className="card pad stack">
            <div className="row between"><h3>{focused.title}</h3><button className="btn ghost small" onClick={() => setFocus(null)}>Close</button></div>
            <ClosingControl ctx={ctx} item={focused} />
            {!focused.bids.length && <p className="muted small">No bids yet.</p>}
            <BidOperations ctx={ctx} item={focused} />
          </div>
        ) : (
          <div className="card pad stack">
            <h3>Latest bids</h3>
            {!data.activity.length && <p className="muted small">Bids appear here the moment they land.</p>}
            <div className="feed">{data.activity.filter(a=>!a.voided).slice(0, 12).map(a => (
              <div key={a.id}><span className="faint small">{fmtClock(a.at, e.timezone)}</span><span className="grow small"><b>{a.name}</b> on {titles.get(a.itemId)}</span><span className="money">{formatMoney(a.amountMinor)}</span></div>
            ))}</div>
          </div>
        )}
        <div className="card pad"><People ctx={ctx} compact /></div>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- results mode

function ResultsBoard({ ctx }: { ctx: Ctx }) {
  const { data } = ctx, e = data.event;
  const closed = data.items.filter(i => i.ready || i.bidCount);
  const decided = closed.filter(i => i.award).length;
  return (
    <div className="board single">
      <div className="board-main stack">
        <div className="row between wrap">
          <div><h2>Winners</h2><p className="small muted">{decided} of {closed.length} decided. Confirmed winners see “You won” and your message to winners.</p></div>
          <div className="row wrap">
            <a className="btn small" href={`/api/v1/host/events/${e.id}/export/results`}>Export results</a>
            <a className="btn small" href={`/api/v1/host/events/${e.id}/export/participants`}>Export participants</a>
          </div>
        </div>
        {closed.map(item => <ResultRow key={item.id} ctx={ctx} item={item} />)}
        {(e.donationsEnabled || data.pledges.length > 0) && <div className="card pad"><Donations ctx={ctx} /></div>}
      </div>
    </div>
  );
}

function ShareDialog({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="modal wide" onClose={onClose}>
      <div className="row between"><span /><button className="btn ghost small" onClick={() => ref.current?.close()}>Close</button></div>
      <Share ctx={ctx} />
    </dialog>
  );
}


function ClosingControl({ctx,item}:{ctx:Ctx;item:Item}) {
 const [value,setValue]=useState(toLocalInput(item.effectiveClosesAt,ctx.data.event.timezone));
 useEffect(()=>setValue(toLocalInput(item.effectiveClosesAt,ctx.data.event.timezone)),[item.effectiveClosesAt,ctx.data.event.timezone]);
 return <div className="stack"><label className="field"><span>Item closes</span><input type="datetime-local" value={value} onChange={x=>setValue(x.target.value)}/></label><p className="hint">After the first bid, closing must stay at least five minutes from now.</p><button className="btn small" onClick={async()=>{const closesAt=fromLocalInput(value,ctx.data.event.timezone);if(!closesAt)return;const r=await api("PATCH",`/api/v1/host/items/${item.id}`,{revision:item.revision,closesAt}).catch(()=>null);ctx.flash(r?.ok?"Closing time saved":r?errorText(r):"Connection lost. Check the closing time before retrying.");await ctx.reload();}}>Save closing time</button></div>;
}
function BidOperations({ctx,item}:{ctx:Ctx;item:Item}) {
 const [bidId,setBidId]=useState(""),[reason,setReason]=useState(""),[withdraw,setWithdraw]=useState(false),[message,setMessage]=useState("This item has been withdrawn by the host. Bidding is no longer available."),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function send(path:string,body:object){setBusy(true);setError("");const r=await api("POST",`/api/v1/host/items/${item.id}/${path}`,body).catch(()=>null);if(r?.ok){setBidId("");setWithdraw(false);ctx.flash(path==="void-bid"?"Bid voided. Standing recalculated.":"Item withdrawn. Participants can see your message.");await ctx.reload();}else setError(r?errorText(r):"Connection lost. Check the item before retrying.");setBusy(false);}
 return <div className="stack operations-panel">{item.withdrawn&&<p className="notice warn">Withdrawn · {item.withdrawalMessage}</p>}{item.bids.map(b=><div className="stack" style={{gap:4,borderBottom:"1px solid var(--line)",paddingBottom:10}} key={b.id}><div className="row between small"><span><b>{b.name}</b><span className="muted"> · {b.business}</span></span><span className="money">{formatMoney(b.amountMinor)}</span></div><div className="row between"><span className="small muted">{fmtClock(b.at,ctx.data.event.timezone)}</span>{b.voided?<span className="small muted">Voided · {b.voidReason}</span>:<button className="btn ghost small" onClick={()=>{setBidId(b.id);setReason("");}}>Void bid</button>}</div></div>)}{bidId&&<form className="operation-confirm stack" onSubmit={x=>{x.preventDefault();send("void-bid",{bidId,reason});}}><b>Void this bid?</b><p className="small">The highest remaining bid becomes the leader. Any winner affected by this bid must be confirmed again.</p><label className="field"><span>Reason</span><input required maxLength={500} value={reason} onChange={x=>setReason(x.target.value)}/></label><div className="row"><button className="btn small danger" disabled={busy||!reason.trim()}>Confirm void</button><button type="button" className="btn small" onClick={()=>setBidId("")}>Cancel</button></div></form>}{!item.withdrawn&&!withdraw&&<button className="btn small danger" onClick={()=>setWithdraw(true)}>Withdraw item</button>}{withdraw&&<form className="operation-confirm stack" onSubmit={x=>{x.preventDefault();send("withdraw",{message});}}><b>Withdraw this item?</b><p className="small">Bidding stops. Bid history stays in the event, and participants see your message.</p><label className="field"><span>Message to participants</span><textarea required maxLength={500} value={message} onChange={x=>setMessage(x.target.value)}/></label><div className="row"><button className="btn small danger" disabled={busy||!message.trim()}>Confirm withdrawal</button><button type="button" className="btn small" onClick={()=>setWithdraw(false)}>Cancel</button></div></form>}{error&&<p className="notice error" role="alert">{error}</p>}</div>;
}
