"use client";
// Set up: a checklist that knows the event, the attendee's phone as an editable canvas, and an inspector for the selection.
import { accentVars, accentReadable, readableAccent, contrast, ACCENT_MIN } from "../../../lib/color";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, dollarsInput, errorText, fmtClock, fmtTime, fromLocalInput, newId, parseDollars, toLocalInput } from "../../../lib/api";
import { formatMoney, increment } from "../../../lib/money";
import { THEMES } from "../../../lib/templates";
import { ICalendar, ICheck, IChevD, IChevR, IDrag, IEye, IEyeOff, IGift, IGrid, IHeart, IInfo, IPalette, IPhone, IPlus, ISliders, IStore, ITrash, IArrowUp, IUpload } from "../../../lib/icons";
import { EditCtx, EventHero, Facts, Ed, ItemCard, SponsorGrid, type EditApi } from "../../e/[code]/ui";
import { ItemPage } from "../../e/[code]/item";
import { EventClock } from "../../e/[code]/catalog";
import type { Nav } from "../../e/[code]/participant";
import { confirm, isConfirmed, toSnapshot, type Data, type Item } from "../data";
import { Housekeeping } from "./housekeeping";
import { MoneyField, PhotoField, Ring, Seg, Switch, TextField } from "../kit";

export type Sel = { kind: "event" | "schedule" | "theme" | "rules" | "donations" | "sponsors" } | { kind: "item"; id: string };
export type Screen = "welcome" | "items" | "item";
export type SetupCtx = {
  data: Data; reload: () => Promise<void>; flash: (t: string, tone?: "ink" | "red" | "green") => void;
  patchEvent: (f: Record<string, unknown>) => Promise<boolean>; patchItem: (i: Item, f: Record<string, unknown>) => Promise<boolean>;
  track: (run: () => Promise<{ ok: boolean; message?: string }>) => Promise<boolean>;
  openShare: () => void; previewed: boolean;
};

// ---------------------------------------------------------------- checklist
type Step = { key: string; label: string; detail?: string; done: boolean; go: () => void };
export function useSteps(ctx: SetupCtx, select: (s: Sel, screen?: Screen) => void, addItem: () => void): Step[] {
  const { data } = ctx, e = data.event;
  const missing = data.items.filter(i => !i.imageUrl);
  const scheduleOk = e.status === "live" || isConfirmed(e.id, "schedule");
  return [
    { key: "schedule", label: "Confirm the date and time", detail: `${fmtTime(e.startsAt, e.timezone)}`, done: scheduleOk, go: () => select({ kind: "schedule" }, "welcome") },
    { key: "cover", label: "Add a cover photo", detail: "The first thing guests see", done: Boolean(e.coverUrl), go: () => select({ kind: "event" }, "welcome") },
    { key: "welcome", label: "Write a welcome", detail: "A line or two is plenty", done: Boolean(e.welcome.trim()), go: () => select({ kind: "event" }, "welcome") },
    { key: "items", label: data.items.length >= 3 ? `${data.items.length} items added` : "Add at least 3 items", detail: data.items.length < 3 ? `${data.items.length} so far` : undefined, done: data.items.length >= 3, go: addItem },
    { key: "photos", label: "A photo for every item", detail: missing.length && data.items.length ? `${missing.length} missing` : undefined, done: data.items.length > 0 && !missing.length, go: () => missing[0] ? select({ kind: "item", id: missing[0].id }, "item") : addItem() },
    { key: "winners", label: "Tell winners what's next", detail: "Pickup or delivery", done: Boolean(e.winnerInstructions.trim()), go: () => select({ kind: "event" }, "welcome") },
    { key: "preview", label: "Preview it on your phone", done: ctx.previewed || e.status === "live", go: ctx.openShare },
    { key: "live", label: e.status === "live" ? "Live. Share your code" : "Go live and share the code", done: e.status === "live", go: ctx.openShare },
  ];
}

export function Checklist({ steps, startOpen = false }: { steps: Step[]; startOpen?: boolean }) {
  const done = steps.filter(s => s.done).length;
  const next = steps.find(s => !s.done);
  const [open, setOpen] = useState(startOpen);
  return (
    <section className={`ck${open ? " open" : ""}`}>
      <div className="ck-head">
        <Ring done={done} total={steps.length} size={40} />
        {next ? <button type="button" className="ck-next" onClick={next.go}><small>Next step</small><b>{next.label}</b></button>
          : <div className="ck-next"><small>All set</small><b>Ready for the show</b></div>}
        <button type="button" className="sx-icon-btn sm" aria-expanded={open} aria-label={open ? "Hide all steps" : "Show all steps"} onClick={() => setOpen(!open)}><IChevD size={18} /></button>
      </div>
      {open && (
        <ol>
          {steps.map(s => (
            <li key={s.key}><button type="button" className={`ck-step${s.done ? " done" : ""}${s === next ? " next" : ""}`} onClick={s.go}>
              <span className="tick" aria-hidden="true">{s.done && <ICheck size={14} />}</span>
              <span className="ck-t"><b>{s.label}</b>{s.detail && !s.done && <small>{s.detail}</small>}</span>
            </button></li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function Outline({ ctx, sel, select, addItem }: { ctx: SetupCtx; sel: Sel; select: (s: Sel, screen?: Screen) => void; addItem: () => void }) {
  const { data } = ctx;
  const row = (s: Sel, icon: ReactNode, label: string, sub?: string, screen?: Screen) => {
    const on = JSON.stringify(s) === JSON.stringify(sel);
    return <button type="button" className={`ol-row${on ? " on" : ""}`} onClick={() => select(s, screen)}>{icon}<span><b>{label}</b>{sub && <small>{sub}</small>}</span></button>;
  };
  return (
    <section className="ol">
      <h3>Event</h3>
      {row({ kind: "event" }, <IInfo size={18} />, "Welcome & details", undefined, "welcome")}
      {row({ kind: "schedule" }, <ICalendar size={18} />, "Schedule", fmtClock(data.event.startsAt, data.event.timezone) + "–" + fmtClock(data.event.endsAt, data.event.timezone), "welcome")}
      {row({ kind: "theme" }, <IPalette size={18} />, "Look", THEMES.find(t => t.id === data.event.theme)?.name)}
      {row({ kind: "rules" }, <ISliders size={18} />, "Bidding rules", BIDDER_OPTIONS.find(o => o.id === data.event.bidderDisplay)?.label ?? "")}
      {row({ kind: "donations" }, <IHeart size={18} />, "Donations", data.recipients.length ? `${data.recipients.length} nonprofit${data.recipients.length === 1 ? "" : "s"}` : "Off")}
      {row({ kind: "sponsors" }, <IStore size={18} />, "Sponsors", data.sponsors.length ? `${data.sponsors.length}` : "None yet", "welcome")}
      <div className="ol-items-head"><h3>Items <span>{data.items.length}</span></h3><button type="button" className="sx-icon-btn sm" aria-label="Add item" onClick={addItem}><IPlus size={18} /></button></div>
      <ul className="ol-items">
        {data.items.map(i => {
          const on = sel.kind === "item" && sel.id === i.id;
          return (
            <li key={i.id}><button type="button" className={`ol-item${on ? " on" : ""}${i.ready ? "" : " hidden"}`} onClick={() => select({ kind: "item", id: i.id }, "item")}>
              <span className="oi-thumb">{i.imageUrl ? <img src={i.imageUrl} alt="" /> : <span>{String(i.position + 1).padStart(2, "0")}</span>}</span>
              <span className="oi-t"><b>{i.title}</b><small>{i.ready ? (i.bidCount ? `${formatMoney(i.currentMinor!)} · ${i.bidCount} bid${i.bidCount === 1 ? "" : "s"}` : `Starts ${formatMoney(i.openingMinor)}`) : "Hidden"}</small></span>
              {!i.imageUrl && <span className="oi-warn" title="No photo yet" />}
            </button></li>
          );
        })}
      </ul>
      {!data.items.length && <button type="button" className="ol-add" onClick={addItem}><IPlus size={18} />Add your first item</button>}
    </section>
  );
}

// ---------------------------------------------------------------- canvas
export function Canvas({ ctx, sel, select, screen, setScreen, addItem }: { ctx: SetupCtx; sel: Sel; select: (s: Sel, screen?: Screen) => void; screen: Screen; setScreen: (s: Screen) => void; addItem: () => void }) {
  const { data, patchEvent, patchItem, flash, reload } = ctx;
  const snap = useMemo(() => toSnapshot(data), [data]);
  const now = new Date(data.serverNow).getTime();
  const [uploading, setUploading] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null), [over, setOver] = useState<string | null>(null);
  const handle = useRef<string | null>(null);
  const selKey = sel.kind === "item" ? `item:${sel.id}` : sel.kind === "event" || sel.kind === "schedule" ? "event" : sel.kind;
  const itemFor = (key: string) => data.items.find(i => `item:${i.id}` === key);

  const edit: EditApi = {
    selected: selKey,
    select: key => { if (key === "event") select({ kind: "event" }); else if (key.startsWith("item:")) select({ kind: "item", id: key.slice(5) }); else if (key === "sponsors") select({ kind: "sponsors" }); },
    commit: async (key, field, value) => {
      if (field === "title" && !value) { flash("An item needs a title.", "red"); return false; }
      if (field === "name" && !value) { flash("Your event needs a name.", "red"); return false; }
      if (key === "event") return patchEvent({ [field]: value });
      const it = itemFor(key);
      return it ? patchItem(it, { [field]: value }) : false;
    },
    photo: async (key, file) => {
      setUploading(key);
      try {
        const { uploadPhoto } = await import("../data");
        const asset = await uploadPhoto(file);
        if (key === "event") await patchEvent({ coverAssetId: asset.id });
        else { const it = itemFor(key); if (it) await patchItem(it, { imageAssetId: asset.id }); }
      } catch (e) { flash(e instanceof Error ? e.message : "Upload failed.", "red"); }
      finally { setUploading(null); }
    },
    uploading,
  };
  const noop: Nav = { openItem: id => { select({ kind: "item", id }, "item"); }, openSheet: () => flash("Bidding is off in the editor. Use Preview to try it."), tab: () => {}, back: () => setScreen("items"), watch: () => {} };

  async function move(id: string, to: number) {
    const order = data.items.map(i => i.id).filter(x => x !== id);
    order.splice(Math.max(0, Math.min(order.length, to)), 0, id);
    const r = await api("POST", `/api/v1/host/events/${data.event.id}/items/order`, { order }).catch(() => null);
    if (!r?.ok) flash(r ? errorText(r) : "Connection lost. The order wasn't saved.", "red");
    reload();
  }

  const item = sel.kind === "item" ? snap.items.find(i => i.id === sel.id) : snap.items[0];
  const wsItem = item ? data.items.find(i => i.id === item.id) : undefined;

  return (
    <section className="cv" aria-label="Your event as guests see it">
      <div className="cv-bar">
        <Seg label="Screen" value={screen} onChange={setScreen} options={[{ id: "welcome", label: "Welcome" }, { id: "items", label: "Items" }, { id: "item", label: "Item page" }]} />
      </div>
      <div className="cv-stage">
        <div className="device">
          <span className="device-notch" aria-hidden="true" />
          <div className="device-screen" key={screen === "item" ? `item-${item?.id}` : screen}>
            <EditCtx.Provider value={edit}>
              <div className="pa is-canvas" data-theme={data.event.theme} style={accentVars(data.event.accentColor)} data-screen={screen === "item" ? "item" : "items"}>
                {screen === "welcome" && (
                  <div className="cv-welcome">
                    <EventHero event={snap.event} eyebrow={data.event.venue || "Add a venue in Details"}><p className="ehero-clock"><EventClock snap={snap} now={now} /></p></EventHero>
                    <div className="join-panel">
                      <Facts event={snap.event} items={snap.items.length} />
                      <Ed k="event" field="welcome" value={data.event.welcome} as="p" className="lead" multiline placeholder="Write a welcome: what's this event for, and how should guests take part?" max={5000} />
                      <div className="join-card cv-join" aria-hidden="true">
                        <h2>Join the auction</h2>
                        <div className="pass-preview filled"><span className="pp-clip" /><span className="mark ci you" style={{ "--s": "52px" } as React.CSSProperties}>YB</span><span className="pp-text"><b>Your Business</b><small>A guest</small></span><span className="pp-ev">{data.event.code}</span></div>
                        <span className="cv-fake">Your name</span><span className="cv-fake">Business name</span>
                        <span className="btn primary block lg">Join</span>
                      </div>
                      <div className={`cv-sponsors${sel.kind === "sponsors" ? " is-sel" : ""}`} onClick={() => select({ kind: "sponsors" })}>
                        {data.sponsors.length ? <SponsorGrid sponsors={snap.event.sponsors} /> : <button type="button" className="cv-add-line"><IPlus size={16} />Add sponsors (optional)</button>}
                      </div>
                    </div>
                  </div>
                )}
                {screen === "items" && (
                  <div className="cv-items">
                    <div className="pa-pass static"><div className="pass-badge"><span className="mark ci you" style={{ "--s": "40px" } as React.CSSProperties}>YB</span><span className="pass-text"><b>Your Business</b><small>A guest</small></span></div><div className="pass-event"><span className="pass-ev-name">{data.event.name}</span><span className="pass-ev-code">{data.event.code}</span></div></div>
                    <section className="page-head"><h1>Items</h1><p className="sub"><EventClock snap={snap} now={now} /></p></section>
                    <div className="cards">
                      {snap.items.map((pi, n) => {
                        const wi = data.items[n];
                        const on = sel.kind === "item" && sel.id === pi.id;
                        return (
                          <div key={pi.id} className={`cv-card${on ? " on" : ""}${wi.ready ? "" : " hidden"}${drag === pi.id ? " dragging" : ""}${over === pi.id && drag && drag !== pi.id ? " over" : ""}`}
                            draggable={drag === pi.id || handle.current === pi.id}
                            onDragStart={ev => { if (handle.current !== pi.id) { ev.preventDefault(); return; } setDrag(pi.id); ev.dataTransfer.effectAllowed = "move"; }}
                            onDragOver={ev => { if (drag) { ev.preventDefault(); setOver(pi.id); } }}
                            onDragEnd={() => { setDrag(null); setOver(null); handle.current = null; }}
                            onDrop={ev => { ev.preventDefault(); if (drag && drag !== pi.id) move(drag, n); setDrag(null); setOver(null); handle.current = null; }}>
                            <div className="cv-tools" role="toolbar" aria-label={`${pi.title} tools`}>
                              <span className="cv-grip" title="Drag to reorder" onMouseDown={() => { handle.current = pi.id; }} onMouseUp={() => { handle.current = null; }}><IDrag size={18} /></span>
                              <button type="button" aria-label="Move up" disabled={n === 0} onClick={() => move(pi.id, n - 1)}><IArrowUp size={16} /></button>
                              <button type="button" aria-label="Move down" disabled={n === snap.items.length - 1} onClick={() => move(pi.id, n + 1)} className="flip"><IArrowUp size={16} /></button>
                              <button type="button" aria-label={wi.ready ? "Hide from guests" : "Show to guests"} disabled={wi.bidCount > 0} onClick={() => patchItem(wi, { ready: !wi.ready })}>{wi.ready ? <IEye size={16} /> : <IEyeOff size={16} />}</button>
                              <button type="button" aria-label="Open item page" onClick={() => select({ kind: "item", id: pi.id }, "item")}><IChevR size={16} /></button>
                            </div>
                            {!wi.ready && <span className="cv-hidden-tag"><IEyeOff size={14} />Hidden from guests</span>}
                            <ItemCard item={pi} now={now} canWatch={false} />
                          </div>
                        );
                      })}
                      <button type="button" className="cv-add-card" onClick={addItem}><span><IPlus size={22} /></span><b>Add an item</b><small>Title, photo and a starting bid</small></button>
                    </div>
                  </div>
                )}
                {screen === "item" && (item ? (
                  <ItemPage snap={snap} now={now} nav={noop} code={data.event.code} stale={false} pending={null} item={item} />
                ) : (
                  <div className="cv-empty"><IGrid size={28} /><b>No items yet</b><button type="button" className="btn primary" onClick={addItem}>Add an item</button></div>
                ))}
              </div>
            </EditCtx.Provider>
          </div>
        </div>
        {screen === "item" && wsItem && <p className="cv-note">{wsItem.bidCount > 0 ? `${wsItem.bidCount} bid${wsItem.bidCount === 1 ? "" : "s"} so far. Text and photos can still change.` : "Bidding is off while you edit. Use Preview to try it."}</p>}
      </div>
      <p className="cv-hint">Click text to edit · drop photos onto the phone · drag the handle to reorder</p>
    </section>
  );
}

// ---------------------------------------------------------------- inspectors
export function Inspector({ ctx, sel, select }: { ctx: SetupCtx; sel: Sel; select: (s: Sel, screen?: Screen) => void }) {
  if (sel.kind === "item") { const it = ctx.data.items.find(i => i.id === sel.id); return it ? <ItemPanel key={it.id} ctx={ctx} item={it} onDeleted={() => select({ kind: "event" }, "items")} /> : null; }
  return { event: <EventPanel ctx={ctx} />, schedule: <SchedulePanel ctx={ctx} />, theme: <ThemePanel ctx={ctx} />, rules: <RulesPanel ctx={ctx} key={ctx.data.event.revision} />,
    donations: <DonationsPanel ctx={ctx} />, sponsors: <SponsorsPanel ctx={ctx} /> }[sel.kind];
}

function Panel({ title, icon, children, sub }: { title: string; icon: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return <div className="panel"><div className="panel-head">{icon}<div><h3>{title}</h3>{sub && <p>{sub}</p>}</div></div><div className="panel-body">{children}</div></div>;
}

function EventPanel({ ctx }: { ctx: SetupCtx }) {
  const { data, patchEvent } = ctx, e = data.event;
  return (
    <Panel title="Details" icon={<IInfo size={20} />}>
      <p className="on-phone"><IPhone size={16} />Edit the name, welcome and cover photo on the phone.</p>
      {e.coverUrl && <button type="button" className="sx-btn ghost sm" onClick={() => patchEvent({ coverAssetId: null })}><ITrash size={16} />Remove cover photo</button>}
      <TextField label="Venue" value={e.venue} max={300} placeholder="Saturn Hall, Pasadena" onSave={v => patchEvent({ venue: v })} />
      <TextField label="Message to winners" value={e.winnerInstructions} multiline rows={3} placeholder="Congratulations! Pick up your item at the front desk before 8 PM."
        hint="Only confirmed winners see this." onSave={v => patchEvent({ winnerInstructions: v })} />
      <Housekeeping ctx={ctx} />
    </Panel>
  );
}

function SchedulePanel({ ctx }: { ctx: SetupCtx }) {
  const { data, patchEvent } = ctx, e = data.event, tz = e.timezone;
  const [, force] = useState(0);
  const ok = isConfirmed(e.id, "schedule");
  const setWhen = (field: "startsAt" | "endsAt" | "accessEndsAt", local: string) => { const v = fromLocalInput(local, tz); if (v && new Date(v).getTime() !== new Date(e[field]).getTime()) patchEvent({ [field]: v }); };
  return (
    <Panel title="Schedule" icon={<ICalendar size={20} />} sub={tz.replace(/_/g, " ")}>
      <div className="when-card">
        <label className="sx-field"><span className="sx-label">Bidding opens</span><input type="datetime-local" defaultValue={toLocalInput(e.startsAt, tz)} key={`s${e.revision}`} disabled={e.hasBids} onBlur={x => setWhen("startsAt", x.target.value)} /></label>
        <label className="sx-field"><span className="sx-label">Bidding closes</span><input type="datetime-local" defaultValue={toLocalInput(e.endsAt, tz)} key={`e${e.revision}`} onBlur={x => setWhen("endsAt", x.target.value)} /></label>
        {e.hasBids && <p className="sx-hint">Opening is locked once bidding starts. Closing can move, but not to within 5 minutes from now.</p>}
      </div>
      <div className="quick-shift">
        <span className="sx-label">Move the close</span>
        <div className="qs-btns">{[-15, 15, 30, 60].map(m => <button type="button" key={m} className="sx-chip" onClick={() => patchEvent({ endsAt: new Date(new Date(e.endsAt).getTime() + m * 60_000).toISOString() })}>{m > 0 ? `+${m}` : m} min</button>)}</div>
      </div>
      {e.status === "draft" && <button type="button" className={`sx-btn ${ok ? "" : "primary"} block`} onClick={() => { confirm(e.id, "schedule"); force(x => x + 1); ctx.flash("Schedule confirmed", "green"); }}>{ok ? <><ICheck size={18} />Times confirmed</> : "These times are right"}</button>}
      <details className="sx-adv"><summary>Advanced<IChevD size={16} /></summary>
        <label className="sx-field"><span className="sx-label">Guests can come back to see results until</span><input type="datetime-local" defaultValue={toLocalInput(e.accessEndsAt, tz)} key={`a${e.revision}`} onBlur={x => setWhen("accessEndsAt", x.target.value)} /></label>
        <TextField label="Time zone" value={tz} onSave={v => patchEvent({ timezone: v })} hint="For example America/Los_Angeles" />
        <Switch on={e.entryOpen} onChange={v => patchEvent({ entryOpen: v })} label="New guests can join" sub="Turn off to stop new sign-ups. People who joined keep access." />
      </details>
    </Panel>
  );
}

function ThemePanel({ ctx }: { ctx: SetupCtx }) {
  const e = ctx.data.event;
  const base = THEMES.find(t => t.id === e.theme) ?? THEMES[0];
  const current = e.accentColor ?? base.accent;
  const [draft, setDraft] = useState(current);
  useEffect(() => { setDraft(current); }, [current]);
  const valid = /^#[0-9A-F]{6}$/.test(draft), ok = valid && accentReadable(draft, base.ink), ratio = valid ? contrast(draft, base.ink) : 0;
  return (
    <Panel title="Look" icon={<IPalette size={20} />} sub="Pick a theme. Leading, outbid and closing colours stay the same in every theme.">
      <div className="look-grid" role="radiogroup" aria-label="Theme">
        {THEMES.map(t => {
          const on = e.theme === t.id;
          return (
            <button type="button" key={t.id} role="radio" aria-checked={on} className={`look-card${on ? " on" : ""}`} onClick={() => ctx.patchEvent({ theme: t.id })}>
              <span className="lk-prev" style={{ background: t.paper }} aria-hidden="true">
                <span className="lk-pass" style={{ background: t.ink }}><i style={{ background: on && e.accentColor ? e.accentColor : t.accent }} /><em /></span>
                <span className="lk-card" style={{ background: t.card }}><span className="lk-img" style={{ background: t.ink }} /><span className="lk-line" /><span className="lk-btn" /></span>
              </span>
              <span className="lk-name"><b>{t.name}</b><small>{t.mood}</small></span>
              {on && <span className="lk-check"><ICheck size={14} /></span>}
            </button>
          );
        })}
      </div>

      <h4 className="panel-sub">Accent colour</h4>
      <p className="sx-hint">Marks what&rsquo;s yours in the guest app: the pass, your bids, your wins.{e.accentColor ? "" : ` Using ${base.name}\u2019s own.`}</p>
      <div className="accent-row">
        <label className="accent-swatch" style={{ background: valid ? draft : "#fff" }}>
          <input type="color" value={valid ? draft.toLowerCase() : "#000000"} onChange={x => setDraft(x.target.value.toUpperCase())} aria-label="Pick an accent colour" />
        </label>
        <input className="accent-hex" value={draft} maxLength={7} spellCheck={false} aria-label="Accent colour code"
          onChange={x => { const v = x.target.value.toUpperCase(); setDraft(v.startsWith("#") ? v : `#${v}`); }} />
        <button type="button" className="sx-btn primary sm" disabled={!ok || draft === current} onClick={() => ctx.patchEvent({ accentColor: draft })}>Use colour</button>
      </div>
      {valid && (
        <div className={`contrast ${ok ? "ok" : "bad"}`} role="status">
          <span className="ct-sample" style={{ background: draft, color: base.ink }} aria-hidden="true">Aa</span>
          <span className="ct-t">{ok ? <><b>Easy to read</b> {ratio.toFixed(1)}:1 against the text colour</> : <><b>Hard to read</b> {ratio.toFixed(1)}:1 against the text colour; it needs {ACCENT_MIN}:1.</>}</span>
          {!ok && <button type="button" className="sx-btn sm" onClick={() => setDraft(readableAccent(draft, base.ink))}>Fix contrast</button>}
        </div>
      )}
      {e.accentColor && <button type="button" className="sx-btn ghost sm" onClick={() => ctx.patchEvent({ accentColor: null })}>Use {base.name}&rsquo;s accent</button>}
    </Panel>
  );
}

function ItemPanel({ ctx, item, onDeleted }: { ctx: SetupCtx; item: Item; onDeleted: () => void }) {
  const { data, patchItem, reload, flash } = ctx, tz = data.event.timezone, locked = item.bidCount > 0;
  const cats = [...new Set(data.items.map(i => i.category).filter(Boolean))];
  const [confirmDelete, setConfirmDelete] = useState(false);
  const p = (f: Record<string, unknown>) => patchItem(item, f);
  return (
    <Panel title={`Item ${String(item.position + 1).padStart(2, "0")}`} icon={<IGift size={20} />} sub={locked ? `${item.bidCount} bid${item.bidCount === 1 ? "" : "s"} · top ${formatMoney(item.currentMinor!)}` : undefined}>
      <p className="on-phone"><IPhone size={16} />Edit the title, photo and text on the phone.</p>
      {item.imageUrl && <button type="button" className="sx-btn ghost sm" onClick={() => p({ imageAssetId: null })}><ITrash size={16} />Remove photo</button>}
      <MoneyField label="Starting bid" minor={item.openingMinor} disabled={locked} onSave={v => v && p({ openingMinor: v })} hint={locked ? "Locked once someone bids." : undefined} />
      <div className="sx-field">
        <TextField label="Category" value={item.category} max={100} placeholder="Travel" onSave={v => p({ category: v })} />
        {cats.length > 0 && <div className="cat-chips">{cats.filter(c => c !== item.category).slice(0, 6).map(c => <button type="button" key={c} className="sx-chip" onClick={() => p({ category: c })}>{c}</button>)}</div>}
      </div>
      <TextField label="Provided by" value={item.donor} max={200} placeholder="Business that donated it" onSave={v => p({ donor: v })} />
      <Switch on={item.ready} disabled={locked && item.ready} onChange={v => p({ ready: v })} label="Show to guests" sub={locked ? "Items with bids stay visible." : undefined} />
      <details className="sx-adv"><summary>Advanced<IChevD size={16} /></summary>
        <MoneyField label="Raise each bid by" minor={item.incrementOverrideMinor} allowEmpty disabled={locked} placeholder="Event default" onSave={v => p({ incrementOverrideMinor: v })} hint="Leave empty to use the event's increments." />
        <label className="sx-field"><span className="sx-label">Opens (empty = event start)</span><input type="datetime-local" key={`o${item.revision}`} disabled={locked} defaultValue={toLocalInput(item.opensAt, tz)} onBlur={x => { const v = fromLocalInput(x.target.value, tz); if ((v ?? null) !== (item.opensAt ? new Date(item.opensAt).toISOString() : null)) p({ opensAt: v }); }} /></label>
        <label className="sx-field"><span className="sx-label">Closes (empty = event close)</span><input type="datetime-local" key={`c${item.revision}`} defaultValue={toLocalInput(item.closesAt, tz)} onBlur={x => { const v = fromLocalInput(x.target.value, tz); if ((v ?? null) !== (item.closesAt ? new Date(item.closesAt).toISOString() : null)) p({ closesAt: v }); }} /></label>
        {confirmDelete ? (
          <div className="danger-confirm"><span>Delete &ldquo;{item.title}&rdquo;?</span>
            <button type="button" className="sx-btn danger sm" onClick={async () => { const r = await api("DELETE", `/api/v1/host/items/${item.id}`).catch(() => null); if (r?.ok) { flash("Item deleted"); onDeleted(); reload(); } else flash(r ? errorText(r) : "Connection lost.", "red"); }}>Delete</button>
            <button type="button" className="sx-btn ghost sm" onClick={() => setConfirmDelete(false)}>Keep</button></div>
        ) : <button type="button" className="sx-btn danger-ghost" disabled={locked} onClick={() => setConfirmDelete(true)}><ITrash size={16} />{locked ? "Items with bids can't be deleted" : "Delete item"}</button>}
      </details>
    </Panel>
  );
}

function RulesPanel({ ctx }: { ctx: SetupCtx }) {
  const { data, patchEvent, flash } = ctx, e = data.event, locked = e.hasBids;
  const initial = () => ({ mode: e.bidMode, tiers: e.tiers.map(t => ({ below: t.belowMinor === null ? "" : dollarsInput(t.belowMinor), raise: dollarsInput(t.raiseMinor) })),
    fixed: e.fixedIncrementMinor ? dollarsInput(e.fixedIncrementMinor) : "25" });
  const [form, setForm] = useState(initial);
  const { mode, tiers, fixed } = form;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial());
  const parsed = tiers.map((t, i) => ({ belowMinor: i === tiers.length - 1 ? null : parseDollars(t.below), raiseMinor: parseDollars(t.raise) ?? 0 }));
  const complete = mode === "fixed" ? Boolean(parseDollars(fixed)) : parsed.every((t, i) => t.raiseMinor > 0 && (i === parsed.length - 1 || (t.belowMinor ?? 0) > 0));
  const rules = { mode, tiers: parsed, fixedIncrementMinor: parseDollars(fixed) };
  const example = [5_000, 25_000, 100_000].map(v => ({ at: v, next: v + (complete ? increment(v, rules, null) : 0) }));
  const setTier = (i: number, patch: Partial<{ below: string; raise: string }>) => setForm({ ...form, tiers: tiers.map((t, j) => j === i ? { ...t, ...patch } : t) });
  async function save() {
    if (!complete) { flash("Fill in every amount first.", "red"); return; }
    const body: Record<string, unknown> = { bidMode: mode, tiers: parsed };
    if (mode === "fixed") body.fixedIncrementMinor = parseDollars(fixed);
    if (await patchEvent(body)) flash("Bid increments saved", "green");
  }
  return (
    <Panel title="Bidding rules" icon={<ISliders size={20} />}>
      <BidderDisplayPicker ctx={ctx} />
      <fieldset className="choice-group" disabled={locked}>
        <legend className="panel-sub">Bid increments</legend>
        {locked && <p className="sx-hint">Bidding has started, so increments are locked to keep things fair.</p>}
        {([["tiered", "Grows with price", "Small steps on small bids, bigger steps as prices climb."], ["fixed", "Same every time", "Every bid adds the same amount."]] as const).map(([id, label, sub]) => (
          <label key={id} className={`choice${mode === id ? " on" : ""}`}>
            <input type="radio" name="bid-mode" value={id} checked={mode === id} onChange={() => setForm({ ...form, mode: id })} />
            <span className="ch-dot" aria-hidden="true" /><span className="ch-t"><b>{label}</b><small>{sub}</small></span>
          </label>
        ))}
      </fieldset>
      {mode === "fixed" ? (
        <label className="sx-field"><span className="sx-label">Every bid adds</span><span className="sx-money"><b>$</b><input inputMode="decimal" value={fixed} disabled={locked} onChange={x => setForm({ ...form, fixed: x.target.value })} /></span></label>
      ) : (
        <div className="steps-table" role="table" aria-label="Increment steps">
          <div className="st-row st-head" role="row"><span role="columnheader">When the top bid is</span><span role="columnheader">Each bid adds</span><span /></div>
          {tiers.map((t, i) => {
            const last = i === tiers.length - 1, from = i === 0 ? "$0" : `$${tiers[i - 1].below || "…"}`;
            return (
              <div key={i} className="st-row" role="row">
                <span className="st-range" role="cell">{last ? <>{from} or more</> : <>{from} to <span className="sx-money sm inline"><b>$</b><input inputMode="decimal" value={t.below} disabled={locked} aria-label={`Step ${i + 1} upper limit`} onChange={x => setTier(i, { below: x.target.value })} /></span></>}</span>
                <span role="cell"><span className="sx-money sm"><b>$</b><input inputMode="decimal" value={t.raise} disabled={locked} aria-label={`Step ${i + 1} adds`} onChange={x => setTier(i, { raise: x.target.value })} /></span></span>
                <span role="cell">{!locked && tiers.length > 1 && !last && <button type="button" className="sx-icon-btn sm" aria-label={`Remove step ${i + 1}`} onClick={() => setForm({ ...form, tiers: tiers.filter((_, j) => j !== i) })}><ITrash size={15} /></button>}</span>
              </div>
            );
          })}
          {!locked && tiers.length < 10 && <button type="button" className="sx-btn ghost sm st-add" onClick={() => setForm({ ...form, tiers: [...tiers.slice(0, -1), { below: "", raise: "" }, tiers[tiers.length - 1]] })}><IPlus size={16} />Add a step</button>}
        </div>
      )}
      {complete && <p className="rule-example">For example: {example.map((x, n) => <span key={n}>{formatMoney(x.at)} → next bid <b>{formatMoney(x.next)}</b></span>)}</p>}
      <p className="sx-hint">Any item can use its own increment, under the item&rsquo;s Advanced settings.</p>
      {!locked && dirty && <div className="ops-acts"><button type="button" className="sx-btn primary" onClick={save} disabled={!complete}>Save increments</button><button type="button" className="sx-btn ghost" onClick={() => setForm(initial())}>Cancel</button></div>}
    </Panel>
  );
}

const BIDDER_OPTIONS = [
  { id: "name_business", label: "Name and business", example: "Alice Chen · Juniper Design" },
  { id: "business", label: "Business only", example: "Juniper Design" },
  { id: "anonymous", label: "Anonymous", example: "Bidder 12" },
] as const;

/** "Show bidders as": how other guests and the stage display see who's bidding. Staff always see everyone in full. */
function BidderDisplayPicker({ ctx }: { ctx: SetupCtx }) {
  const value = ctx.data.event.bidderDisplay;
  return (
    <fieldset className="choice-group">
      <legend className="panel-sub">Show bidders as</legend>
      {BIDDER_OPTIONS.map(o => (
        <label key={o.id} className={`choice${value === o.id ? " on" : ""}`}>
          <input type="radio" name="bidder-display" value={o.id} checked={value === o.id} onChange={() => ctx.patchEvent({ bidderDisplay: o.id })} />
          <span className="ch-dot" aria-hidden="true" />
          <span className="ch-t"><b>{o.label}</b><small>{o.example}</small></span>
        </label>
      ))}
      <p className="sx-hint">Applies to other guests&rsquo; phones and the stage display. You and your staff always see full names.</p>
    </fieldset>
  );
}

function DonationsPanel({ ctx }: { ctx: SetupCtx }) {
  const { data, patchEvent, reload, flash } = ctx, e = data.event;
  const [name, setName] = useState(""), [desc, setDesc] = useState("");
  return (
    <Panel title="Donations" icon={<IHeart size={20} />}>
      <p className={`don-state${data.recipients.length ? " on" : ""}`}>{data.recipients.length
        ? <>Guests can donate until <b>{fmtTime(e.donationDeadline ?? e.endsAt, e.timezone)}</b>, from the Donate tab.</>
        : <>Add a nonprofit and a Donate tab appears for guests. Remove them all to turn donations off.</>}</p>
      <div className="recips">
        {data.recipients.map(r => (
          <div key={r.id} className="recip"><span className="mark-sq">{r.name.slice(0, 2).toUpperCase()}</span><span><b>{r.name}</b>{r.description && <small>{r.description}</small>}</span>
            <button type="button" className="sx-icon-btn sm" aria-label={`Remove ${r.name}`} onClick={async () => { await api("DELETE", `/api/v1/host/events/${e.id}/recipients/${r.id}`).catch(() => null); reload(); }}><ITrash size={15} /></button></div>
        ))}
      </div>
      <form className="add-recip" onSubmit={async x => { x.preventDefault(); if (!name.trim()) return;
        const r = await api("POST", `/api/v1/host/events/${e.id}/recipients`, { name, description: desc }).catch(() => null);
        if (r?.ok) { setName(""); setDesc(""); reload(); } else flash(r ? errorText(r) : "Connection lost.", "red"); }}>
        <label className="sx-field"><span className="sx-label">Add a nonprofit</span><input value={name} onChange={x => setName(x.target.value)} placeholder="Pasadena Humane" /></label>
        <label className="sx-field"><span className="sx-label">Short note (optional)</span><input value={desc} onChange={x => setDesc(x.target.value)} placeholder="Animal shelter and adoption" /></label>
        <button className="sx-btn" disabled={!name.trim()}><IPlus size={16} />Add nonprofit</button>
      </form>
      <p className="sx-hint">Guests give $25, $50, $100 or any amount up to $10,000. Mark each donation processed in Results.</p>
      <details className="sx-adv"><summary>Advanced<IChevD size={16} /></summary>
        <label className="sx-field"><span className="sx-label">Donations close</span><input type="datetime-local" key={`d${e.revision}`} defaultValue={toLocalInput(e.donationDeadline ?? e.endsAt, e.timezone)} onBlur={x => { const v = fromLocalInput(x.target.value, e.timezone); if (v) patchEvent({ donationDeadline: v }); }} /></label>
      </details>
    </Panel>
  );
}

type SponsorRow = { k: string; name: string; url: string; logoAssetId: string | null; logoUrl: string | null };

function SponsorsPanel({ ctx }: { ctx: SetupCtx }) {
  const { data, reload, flash } = ctx;
  // The panel owns its rows: a sponsor isn't saved until it has a name, and a logo added first is never lost.
  const [list, setList] = useState<SponsorRow[]>(() => data.sponsors.map(s => ({ k: s.id, name: s.name, url: s.url, logoAssetId: s.logoAssetId, logoUrl: s.logoUrl })));
  const listRef = useRef(list);
  const replace = (next: SponsorRow[]) => { listRef.current = next; setList(next); };
  async function save(next: SponsorRow[]) {
    const r = await ctx.track(async () => {
      const res = await api("PUT", `/api/v1/host/events/${data.event.id}/sponsors`, { sponsors: next.filter(s => s.name.trim()).map(s => ({ name: s.name.trim(), logoAssetId: s.logoAssetId, url: s.url.trim() })) });
      return { ok: res.ok, message: res.ok ? undefined : errorText(res) };
    }).catch(() => false);
    if (r) reload();
  }
  const update = (k: string, patch: Partial<SponsorRow>, persist = false) => {
    // Upload callbacks may belong to an older render. Apply them to the latest rows,
    // and ignore completions for a sponsor removed while its logo was uploading.
    if (!listRef.current.some(x => x.k === k)) return;
    const next = listRef.current.map(x => x.k === k ? { ...x, ...patch } : x);
    replace(next); if (persist) save(next);
  };
  return (
    <Panel title="Sponsors" icon={<IStore size={20} />} sub="Optional. Shown on the welcome screen and the Event tab, with a link if you add one.">
      <div className="sp-rows">
        {list.map(s => (
          <div key={s.k} className="sp-row">
            <LogoTile name={s.name} url={s.logoUrl} onChange={a => update(s.k, { logoAssetId: a?.id ?? null, logoUrl: a?.url ?? null }, true)} onError={m => flash(m, "red")} />
            <div className="sp-fields">
              <input className="sp-name" value={s.name} placeholder="Sponsor name" aria-label="Sponsor name" maxLength={200}
                onChange={e => update(s.k, { name: e.target.value })} onBlur={() => save(listRef.current)} />
              <input className="sp-url" value={s.url} placeholder="Website (optional)" aria-label={`${s.name || "Sponsor"} website`} inputMode="url" maxLength={500}
                onChange={e => update(s.k, { url: e.target.value })} onBlur={() => save(listRef.current)} />
              {!s.name.trim() && <small className="sp-need">Add a name to save this sponsor.</small>}
            </div>
            <button type="button" className="sx-icon-btn sm" aria-label={`Remove ${s.name || "sponsor"}`} onClick={() => { const next = listRef.current.filter(x => x.k !== s.k); replace(next); save(next); }}><ITrash size={15} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="sx-btn" onClick={() => replace([...listRef.current, { k: newId(), name: "", url: "", logoAssetId: null, logoUrl: null }])}><IPlus size={16} />Add a sponsor</button>
    </Panel>
  );
}

/** A square logo target: click to choose, drop a file, or paste an image. Logos keep transparency. */
function LogoTile({ name, url, onChange, onError }: { name: string; url: string | null; onChange: (a: { id: string; url: string } | null) => void; onError: (m: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false), [over, setOver] = useState(false);
  async function pick(file?: File) {
    if (!file) return;
    setBusy(true);
    try { const { uploadPhoto } = await import("../data"); onChange(await uploadPhoto(file, "logo")); }
    catch (e) { onError(e instanceof Error ? e.message : "The logo didn't upload."); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return (
    <div className={`logo-tile${url ? " has" : ""}${over ? " over" : ""}${busy ? " busy" : ""}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files?.[0]); }}
      onPaste={e => { const f = [...e.clipboardData.files].find(x => x.type.startsWith("image/")); if (f) { e.preventDefault(); pick(f); } }}>
      <button type="button" className="lt-hit" onClick={() => input.current?.click()} aria-label={url ? `Replace ${name || "sponsor"} logo` : `Add ${name || "sponsor"} logo`}>
        {url ? <img src={url} alt="" /> : <span className="lt-empty">{busy ? "…" : <><IUpload size={18} /><small>Logo</small></>}</span>}
      </button>
      {url && !busy && <button type="button" className="lt-x" aria-label="Remove logo" onClick={() => onChange(null)}>×</button>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => pick(e.target.files?.[0])} />
    </div>
  );
}

/** Adds an item with sensible defaults and selects it, retry-safe. */
export function useAddItem(ctx: SetupCtx, onAdded: (id: string) => void) {
  const request = useRef(newId());
  return async () => {
    const r = await api("POST", `/api/v1/host/events/${ctx.data.event.id}/items`, { requestId: request.current, title: "New item", openingMinor: 10_000 }).catch(() => null);
    if (!r?.ok) { ctx.flash(r ? errorText(r) : "Connection lost. Try again. It won't be added twice.", "red"); return; }
    request.current = newId();
    await ctx.reload();
    onAdded(r.data.id);
  };
}
