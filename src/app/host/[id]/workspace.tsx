"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, dollarsInput, errorText, fmtClock, fmtTime, fromLocalInput, newId, parseDollars, toLocalInput, untilText } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { qrcodegen } from "../../../lib/qr-code.js";
import { PhotoPicker, StageChip } from "../ui";

type Bid = { id: string; amountMinor: number; at: string; participantId: string; name: string; business: string };
type Award = { status: "assigned" | "fulfilled" | "no_winner"; bidId: string | null; participantId: string | null; amountMinor: number | null; notes: string; revision: number; updatedAt: string };
export type Item = {
  id: string; position: number; title: string; short: string; description: string; category: string; donor: string; imageAssetId: string | null; imageUrl: string | null;
  openingMinor: number; incrementOverrideMinor: number | null; opensAt: string | null; closesAt: string | null; effectiveOpensAt: string; effectiveClosesAt: string;
  ready: boolean; revision: number; phase: "scheduled" | "open" | "closed"; currentMinor: number | null; bidCount: number; minimumNextMinor: number | null;
  leader: { id: string; name: string; business: string } | null; bids: Bid[]; award: Award | null;
};
type Tier = { belowMinor: number | null; raiseMinor: number };
export type Data = {
  serverNow: string;
  event: { id: string; code: string; name: string; welcome: string; venue: string; winnerInstructions: string; coverAssetId: string | null; coverUrl: string | null; timezone: string;
    startsAt: string; endsAt: string; accessEndsAt: string; status: "draft" | "live"; entryOpen: boolean; theme: string; bidMode: "tiered" | "fixed"; tiers: Tier[]; fixedIncrementMinor: number | null;
    donationsEnabled: boolean; donationDeadline: string | null; revision: number; phase: string; hasBids: boolean };
  items: Item[];
  participants: { id: string; name: string; business: string; canBid: boolean; joinedAt: string; bidCount: number; leadingCount: number; pledgedMinor: number }[];
  activity: { id: string; itemId: string; amountMinor: number; at: string; name: string; business: string }[];
  pledges: { id: string; recipientName: string; amountMinor: number; recordedAt: string; processedAt: string | null; note: string; name: string; business: string }[];
  recipients: { id: string; name: string; description: string; logoAssetId: string | null; logoUrl: string | null }[];
  sponsors: { id: string; name: string; logoAssetId: string | null; logoUrl: string | null }[];
};
type Section = "overview" | "items" | "details" | "bidding" | "donations" | "people" | "results" | "share";
export type Ctx = { data: Data; reload: () => Promise<void>; flash: (text: string) => void; patchEvent: (fields: Record<string, unknown>) => Promise<boolean> };

export default function Workspace({ eventId }: { eventId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState<Section>("overview");
  const [toast, setToast] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((text: string) => { setToast(text); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(""), 3500); }, []);
  const reload = useCallback(async () => {
    try {
      const r = await api<Data>("GET", `/api/v1/host/events/${eventId}`);
      if (r.status === 401) { location.href = "/studio"; return; }
      if (r.ok) { setData(r.data); setError(""); } else setError(errorText(r));
    } catch { setError("Connection lost. Retrying…"); }
  }, [eventId]);
  useEffect(() => {
    reload();
    const poll = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 5000);
    return () => clearInterval(poll);
  }, [reload]);
  useEffect(() => { const h = location.hash.slice(1) as Section; if (h) setSection(h); }, []);
  const go = (s: Section) => { setSection(s); history.replaceState(null, "", `#${s}`); window.scrollTo(0, 0); };

  const patchEvent = useCallback(async (fields: Record<string, unknown>) => {
    if (!data) return false;
    const r = await api("PATCH", `/api/v1/host/events/${eventId}`, { revision: data.event.revision, ...fields }).catch(() => null);
    if (!r) { flash("Connection lost. Nothing was saved."); return false; }
    if (!r.ok) { flash(errorText(r)); await reload(); return false; }
    await reload(); return true;
  }, [data, eventId, flash, reload]);

  if (!data) return <main className="host"><div className="host-main"><p className="muted">{error || "Loading…"}</p></div></main>;
  const ctx: Ctx = { data, reload, flash, patchEvent };
  const e = data.event;
  const needsWinner = data.items.filter(i => i.phase === "closed" && i.ready && !i.award).length;
  const unprocessed = data.pledges.filter(p => !p.processedAt).length;
  const nav: [Section, string, number?][] = [
    ["overview", "Overview"], ["items", "Items", data.items.length], ["details", "Event details"], ["bidding", "Bidding rules"],
    ["donations", "Donations", unprocessed || undefined], ["people", "Participants", data.participants.length], ["results", "Results & winners", needsWinner || undefined], ["share", "Share & entry"],
  ];
  return (
    <main className="host">
      <header className="host-top">
        <a className="brand" href="/studio">Bid<i>Zizi</i></a>
        <span className="muted">/</span>
        <h1 style={{ fontSize: 20 }}>{e.name}</h1>
        <StageChip stage={e.status === "draft" ? "draft" : e.phase} />
        <span className="grow" />
        {error && <span className="chip pending">{error}</span>}
        <span className="small muted">Code <b>{e.code}</b></span>
        {e.status === "live" && <a className="btn small" href={`/e/${e.code}`} target="_blank">Participant view ↗</a>}
        <DuplicateButton eventId={e.id} />
        {e.status === "draft"
          ? <button className="btn primary small" onClick={async () => { if (await patchEvent({ status: "live" })) { flash("Your event is live. Share the code!"); go("share"); } }}>Go live</button>
          : !data.participants.length && <button className="btn small" onClick={() => patchEvent({ status: "draft" })}>Back to draft</button>}
      </header>
      <div className="ws">
        <nav aria-label="Event sections">
          {nav.map(([key, label, count]) => (
            <button key={key} aria-current={section === key ? "page" : undefined} onClick={() => go(key)}>{label}{count ? <span className="count">{count}</span> : null}</button>
          ))}
        </nav>
        <section className="panel">
          {section === "overview" && <Overview ctx={ctx} go={go} />}
          {section === "items" && <Items ctx={ctx} />}
          {section === "details" && <Details ctx={ctx} />}
          {section === "bidding" && <Bidding ctx={ctx} />}
          {section === "donations" && <Donations ctx={ctx} />}
          {section === "people" && <People ctx={ctx} />}
          {section === "results" && <Results ctx={ctx} />}
          {section === "share" && <Share ctx={ctx} />}
        </section>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

export function DuplicateButton({ eventId }: { eventId: string }) {
  const [busy, setBusy] = useState(false);
  const request = useRef(newId());
  return <button className="btn small" disabled={busy} onClick={async () => {
    if (!confirm("Make a new draft with this event's setup and items? Participants, bids and results are not copied.")) return;
    setBusy(true);
    const r = await api("POST", `/api/v1/host/events/${eventId}/duplicate`, { requestId: request.current }).catch(() => null);
    if (r?.ok) location.href = `/host/${r.data.id}`; else setBusy(false);
  }}>Duplicate</button>;
}

// ---------------------------------------------------------------- overview

function Overview({ ctx, go }: { ctx: Ctx; go: (s: Section) => void }) {
  const { data } = ctx, e = data.event, now = new Date(data.serverNow).getTime();
  const high = data.items.reduce((sum, i) => sum + (i.currentMinor ?? 0), 0);
  const donated = data.pledges.reduce((sum, p) => sum + p.amountMinor, 0);
  const itemTitle = useMemo(() => new Map(data.items.map(i => [i.id, i.title])), [data.items]);
  const todo: [string, Section][] = [];
  if (!data.items.length) todo.push(["Add your first item", "items"]);
  if (data.items.some(i => !i.ready)) todo.push([`${data.items.filter(i => !i.ready).length} item(s) hidden from participants`, "items"]);
  if (e.status === "draft" && data.items.length) todo.push(["Preview, then go live and share the code", "share"]);
  const closedNoWinner = data.items.filter(i => i.phase === "closed" && i.ready && !i.award).length;
  if (closedNoWinner) todo.push([`${closedNoWinner} closed item(s) need a winner decision`, "results"]);
  const toFulfil = data.items.filter(i => i.award?.status === "assigned").length;
  if (toFulfil) todo.push([`${toFulfil} winner(s) to follow up`, "results"]);
  const pledges = data.pledges.filter(p => !p.processedAt).length;
  if (pledges) todo.push([`${pledges} donation(s) to process`, "donations"]);
  return (
    <>
      <div className="row between wrap">
        <div><h2>{e.status === "draft" ? "Getting ready" : e.phase === "open" ? "Happening now" : e.phase === "closed" ? "Wrap-up" : "Live, starting soon"}</h2>
          <p className="muted small">{fmtTime(e.startsAt, e.timezone)} – {fmtTime(e.endsAt, e.timezone)}{e.phase === "open" ? ` · ends in ${untilText(e.endsAt, now)}` : ""}</p></div>
      </div>
      <div className="stats4">
        <div className="card stat"><span className="small faint">Joined</span><b>{data.participants.length}</b></div>
        <div className="card stat"><span className="small faint">Bids</span><b>{data.items.reduce((s, i) => s + i.bidCount, 0)}</b></div>
        <div className="card stat"><span className="small faint">High bids total</span><b>{formatMoney(high)}</b></div>
        <div className="card stat"><span className="small faint">Donations</span><b>{formatMoney(donated)}</b></div>
      </div>
      {todo.length > 0 && (
        <div className="card pad stack">
          <h3>Needs attention</h3>
          {todo.map(([text, s]) => <div key={text} className="row between"><span>{text}</span><button className="btn small" onClick={() => go(s)}>Open</button></div>)}
        </div>
      )}
      <div className="card pad stack">
        <h3>Latest bids</h3>
        {!data.activity.length && <p className="muted small">Bids will appear here as they come in.</p>}
        <div className="feed">
          {data.activity.slice(0, 15).map(a => (
            <div key={a.id}><span className="faint small" style={{ width: 64 }}>{fmtClock(a.at, e.timezone)}</span>
              <span className="grow"><b>{a.name}</b> <span className="muted">· {a.business}</span> on {itemTitle.get(a.itemId)}</span>
              <span className="money">{formatMoney(a.amountMinor)}</span></div>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- items

function Items({ ctx }: { ctx: Ctx }) {
  const { data, reload, flash } = ctx;
  const [openId, setOpenId] = useState<string | null>(null);
  const [title, setTitle] = useState(""), [opening, setOpening] = useState(""), [busy, setBusy] = useState(false);
  const request = useRef(newId());
  async function add(event: React.FormEvent) {
    event.preventDefault();
    const openingMinor = parseDollars(opening);
    if (!title.trim() || !openingMinor) { flash("Add a title and a starting amount."); return; }
    setBusy(true);
    const r = await api("POST", `/api/v1/host/events/${data.event.id}/items`, { requestId: request.current, title, openingMinor }).catch(() => null);
    setBusy(false);
    if (r?.ok) { request.current = newId(); setTitle(""); setOpening(""); await reload(); setOpenId(r.data.id); }
    else flash(r ? errorText(r) : "Connection lost. Try again — it won't be added twice.");
  }
  async function move(index: number, delta: number) {
    const order = data.items.map(i => i.id);
    const [moved] = order.splice(index, 1); order.splice(index + delta, 0, moved);
    const r = await api("POST", `/api/v1/host/events/${data.event.id}/items/order`, { order }).catch(() => null);
    if (r && !r.ok) flash(errorText(r));
    reload();
  }
  return (
    <>
      <h2>Items</h2>
      <form className="card pad row wrap" onSubmit={add} style={{ alignItems: "flex-end" }}>
        <label className="field grow" style={{ minWidth: 220 }}><span>New item</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Weekend cabin stay" /></label>
        <label className="field" style={{ width: 160 }}><span>Starting bid</span><input inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} placeholder="$100" /></label>
        <button className="btn primary" disabled={busy}>Add item</button>
      </form>
      {!data.items.length && <p className="muted">No items yet. Add one above — you can fill in photos and details after.</p>}
      <div className="stack">
        {data.items.map((item, index) => (
          <div key={item.id} className="card">
            <div className="item-row">
              <div className="order">
                <button aria-label="Move up" disabled={index === 0} onClick={() => move(index, -1)}>▲</button>
                <button aria-label="Move down" disabled={index === data.items.length - 1} onClick={() => move(index, 1)}>▼</button>
              </div>
              <div className="thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : String(index + 1).padStart(2, "0")}</div>
              <div className="stack" style={{ gap: 4, minWidth: 0 }}>
                <b>{item.title}</b>
                <div className="row wrap small" style={{ gap: 8 }}>
                  {!item.ready ? <span className="chip draft">Hidden</span> : <StageChip stage={item.phase} />}
                  <span className="money">{formatMoney(item.currentMinor ?? item.openingMinor)}</span>
                  <span className="faint">{item.bidCount ? `${item.bidCount} bids · ${item.leader?.name}` : "starting"}</span>
                  <span className="faint">closes {fmtTime(item.effectiveClosesAt, data.event.timezone)}{item.closesAt ? " (custom)" : ""}</span>
                </div>
              </div>
              <button className="btn small" aria-expanded={openId === item.id} onClick={() => setOpenId(openId === item.id ? null : item.id)}>{openId === item.id ? "Close" : "Edit"}</button>
            </div>
            {openId === item.id && <ItemEditor key={item.revision} ctx={ctx} item={item} onDone={() => setOpenId(null)} />}
          </div>
        ))}
      </div>
    </>
  );
}

function ItemEditor({ ctx, item, onDone }: { ctx: Ctx; item: Item; onDone: () => void }) {
  const { data, reload, flash } = ctx, tz = data.event.timezone, locked = item.bidCount > 0;
  const [f, setF] = useState({
    title: item.title, short: item.short, description: item.description, category: item.category, donor: item.donor,
    imageAssetId: item.imageAssetId, imageUrl: item.imageUrl, opening: dollarsInput(item.openingMinor),
    increment: item.incrementOverrideMinor ? dollarsInput(item.incrementOverrideMinor) : "",
    customTimes: Boolean(item.opensAt || item.closesAt), opensAt: toLocalInput(item.opensAt ?? item.effectiveOpensAt, tz), closesAt: toLocalInput(item.closesAt ?? item.effectiveClosesAt, tz), ready: item.ready,
  });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF(x => ({ ...x, ...patch }));
  async function save() {
    const openingMinor = parseDollars(f.opening), incrementOverrideMinor = f.increment ? parseDollars(f.increment) : null;
    if (!f.title.trim() || !openingMinor || (f.increment && !incrementOverrideMinor)) { flash("Check the title and amounts."); return; }
    setBusy(true);
    const body: Record<string, unknown> = { revision: item.revision, title: f.title, short: f.short, description: f.description, category: f.category, donor: f.donor,
      imageAssetId: f.imageAssetId, ready: f.ready, opensAt: f.customTimes ? fromLocalInput(f.opensAt, tz) : null, closesAt: f.customTimes ? fromLocalInput(f.closesAt, tz) : null };
    if (!locked) { body.openingMinor = openingMinor; body.incrementOverrideMinor = incrementOverrideMinor; }
    const r = await api("PATCH", `/api/v1/host/items/${item.id}`, body).catch(() => null);
    setBusy(false);
    if (r?.ok) { flash("Saved"); await reload(); onDone(); } else { flash(r ? errorText(r) : "Connection lost. Nothing was saved."); reload(); }
  }
  async function remove() {
    if (!confirm(`Delete "${item.title}"?`)) return;
    const r = await api("DELETE", `/api/v1/host/items/${item.id}`).catch(() => null);
    if (r?.ok) { flash("Deleted"); reload(); } else flash(r ? errorText(r) : "Connection lost.");
  }
  return (
    <div className="editor">
      <div className="grid2">
        <div className="stack">
          <label className="field"><span>Title</span><input value={f.title} onChange={e => set({ title: e.target.value })} /></label>
          <label className="field"><span>One-line summary</span><input value={f.short} onChange={e => set({ short: e.target.value })} placeholder="Two nights for four, Big Bear" /></label>
          <label className="field"><span>Description</span><textarea value={f.description} onChange={e => set({ description: e.target.value })} /></label>
          <div className="grid2">
            <label className="field"><span>Category</span><input value={f.category} onChange={e => set({ category: e.target.value })} placeholder="Travel" /></label>
            <label className="field"><span>Provided by</span><input value={f.donor} onChange={e => set({ donor: e.target.value })} placeholder="Business name" /></label>
          </div>
        </div>
        <div className="stack">
          <PhotoPicker url={f.imageUrl} onChange={a => set({ imageAssetId: a?.id ?? null, imageUrl: a?.url ?? null })} />
          <div className="grid2">
            <label className="field"><span>Starting bid</span><input inputMode="decimal" value={f.opening} disabled={locked} onChange={e => set({ opening: e.target.value })} /></label>
            <label className="field"><span>Raise by (optional)</span><input inputMode="decimal" value={f.increment} disabled={locked} placeholder="Event default" onChange={e => set({ increment: e.target.value })} /></label>
          </div>
          {locked && <p className="hint">Amounts lock once bidding starts on this item.</p>}
          <label className="check"><input type="checkbox" checked={f.customTimes} onChange={e => set({ customTimes: e.target.checked })} disabled={locked && item.opensAt === null && item.phase !== "scheduled" && false} /> Different times from the event</label>
          {f.customTimes && (
            <div className="grid2">
              <label className="field"><span>Opens</span><input type="datetime-local" value={f.opensAt} disabled={locked} onChange={e => set({ opensAt: e.target.value })} /></label>
              <label className="field"><span>Closes</span><input type="datetime-local" value={f.closesAt} onChange={e => set({ closesAt: e.target.value })} /></label>
            </div>
          )}
          <p className="hint">Times in {tz}. With bids placed, closing can move later, or earlier to no sooner than 5 minutes from now.</p>
          <label className="check"><input type="checkbox" checked={f.ready} disabled={locked} onChange={e => set({ ready: e.target.checked })} /> Show to participants</label>
        </div>
      </div>
      <div className="row between wrap">
        <button className="btn danger small" onClick={remove} disabled={locked}>Delete item</button>
        <div className="row"><button className="btn" onClick={onDone}>Cancel</button><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save item"}</button></div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- details

function Details({ ctx }: { ctx: Ctx }) {
  const { data, patchEvent, flash } = ctx, e = data.event, tz = e.timezone;
  const [f, setF] = useState({ name: e.name, welcome: e.welcome, venue: e.venue, winnerInstructions: e.winnerInstructions, coverAssetId: e.coverAssetId, coverUrl: e.coverUrl,
    startsAt: toLocalInput(e.startsAt, tz), endsAt: toLocalInput(e.endsAt, tz), accessEndsAt: toLocalInput(e.accessEndsAt, tz), timezone: tz });
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF(x => ({ ...x, ...patch }));
  useEffect(() => { setF(x => ({ ...x })); }, [e.revision]);
  async function save() {
    setBusy(true);
    const ok = await patchEvent({ name: f.name, welcome: f.welcome, venue: f.venue, winnerInstructions: f.winnerInstructions, coverAssetId: f.coverAssetId, timezone: f.timezone,
      startsAt: fromLocalInput(f.startsAt, f.timezone), endsAt: fromLocalInput(f.endsAt, f.timezone), accessEndsAt: fromLocalInput(f.accessEndsAt, f.timezone) });
    setBusy(false);
    if (ok) flash("Saved");
  }
  return (
    <>
      <h2>Event details</h2>
      <div className="card pad stack">
        <label className="field"><span>Event name</span><input value={f.name} onChange={x => set({ name: x.target.value })} /></label>
        <PhotoPicker label="Cover photo" url={f.coverUrl} onChange={a => set({ coverAssetId: a?.id ?? null, coverUrl: a?.url ?? null })} />
        <label className="field"><span>Welcome message</span><textarea value={f.welcome} onChange={x => set({ welcome: x.target.value })} placeholder="Welcome! Browse the items and bid from your phone." /></label>
        <label className="field"><span>Venue</span><input value={f.venue} onChange={x => set({ venue: x.target.value })} /></label>
      </div>
      <div className="card pad stack">
        <h3>Schedule</h3>
        <div className="grid2">
          <label className="field"><span>Bidding opens</span><input type="datetime-local" value={f.startsAt} disabled={e.hasBids} onChange={x => set({ startsAt: x.target.value })} /></label>
          <label className="field"><span>Bidding closes</span><input type="datetime-local" value={f.endsAt} onChange={x => set({ endsAt: x.target.value })} /></label>
        </div>
        <div className="grid2">
          <label className="field"><span>Participants can return until</span><input type="datetime-local" value={f.accessEndsAt} onChange={x => set({ accessEndsAt: x.target.value })} /></label>
          <label className="field"><span>Time zone</span><input value={f.timezone} onChange={x => set({ timezone: x.target.value })} /></label>
        </div>
        <p className="hint">Items close at the event close unless you give them their own time. After people leave, they can come back to see results until the return date.</p>
      </div>
      <div className="card pad stack">
        <h3>Winner instructions</h3>
        <label className="field"><span className="sr">Winner instructions</span><textarea value={f.winnerInstructions} onChange={x => set({ winnerInstructions: x.target.value })} placeholder="Congratulations! Pick up your item at the front desk before 8 PM." /></label>
        <p className="hint">Shown only to people you've confirmed as winners.</p>
      </div>
      <Sponsors ctx={ctx} />
      <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save details"}</button></div>
    </>
  );
}

export function Sponsors({ ctx }: { ctx: Ctx }) {
  const { data, reload, flash } = ctx;
  const [list, setList] = useState(data.sponsors.map(s => ({ name: s.name, logoAssetId: s.logoAssetId, logoUrl: s.logoUrl })));
  async function save(next = list) {
    const r = await api("PUT", `/api/v1/host/events/${data.event.id}/sponsors`, { sponsors: next.filter(s => s.name.trim()).map(s => ({ name: s.name, logoAssetId: s.logoAssetId })) }).catch(() => null);
    if (r?.ok) { flash("Sponsors saved"); reload(); } else flash(r ? errorText(r) : "Connection lost.");
  }
  return (
    <div className="card pad stack">
      <div className="row between"><h3>Sponsors</h3><button className="btn small" onClick={() => setList([...list, { name: "", logoAssetId: null, logoUrl: null }])}>Add sponsor</button></div>
      {!list.length && <p className="muted small">Optional. Sponsors show on the welcome page.</p>}
      {list.map((s, i) => (
        <div key={i} className="row wrap" style={{ alignItems: "flex-end" }}>
          <label className="field grow"><span>Name</span><input value={s.name} onChange={e => setList(list.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></label>
          <PhotoPicker label="Logo" url={s.logoUrl} onChange={a => setList(list.map((x, j) => j === i ? { ...x, logoAssetId: a?.id ?? null, logoUrl: a?.url ?? null } : x))} />
          <button className="btn small ghost" onClick={() => { const next = list.filter((_, j) => j !== i); setList(next); save(next); }}>Remove</button>
        </div>
      ))}
      {list.length > 0 && <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn small" onClick={() => save()}>Save sponsors</button></div>}
    </div>
  );
}

// ---------------------------------------------------------------- bidding rules

export function Bidding({ ctx }: { ctx: Ctx }) {
  const { data, patchEvent, flash } = ctx, e = data.event, locked = e.hasBids;
  const [mode, setMode] = useState(e.bidMode);
  const [tiers, setTiers] = useState(e.tiers.map(t => ({ below: t.belowMinor === null ? "" : dollarsInput(t.belowMinor), raise: dollarsInput(t.raiseMinor) })));
  const [fixed, setFixed] = useState(e.fixedIncrementMinor ? dollarsInput(e.fixedIncrementMinor) : "25");
  async function save() {
    const parsed = tiers.map((t, i) => ({ belowMinor: i === tiers.length - 1 ? null : parseDollars(t.below), raiseMinor: parseDollars(t.raise) }));
    if (parsed.some((t, i) => !t.raiseMinor || (i < parsed.length - 1 && !t.belowMinor))) { flash("Fill in every tier amount."); return; }
    const body: Record<string, unknown> = { bidMode: mode, tiers: parsed };
    if (mode === "fixed") { const v = parseDollars(fixed); if (!v) { flash("Set the fixed raise."); return; } body.fixedIncrementMinor = v; }
    if (await patchEvent(body)) flash("Bidding rules saved");
  }
  return (
    <>
      <h2>Bidding rules</h2>
      {locked && <p className="notice info">Bidding has started, so these rules are locked to keep things fair.</p>}
      <div className="card pad stack">
        <h3>How much each new bid must raise</h3>
        <label className="check"><input type="radio" name="mode" checked={mode === "tiered"} disabled={locked} onChange={() => setMode("tiered")} /> Steps that grow with the price (recommended)</label>
        <label className="check"><input type="radio" name="mode" checked={mode === "fixed"} disabled={locked} onChange={() => setMode("fixed")} /> The same raise every time</label>
        {mode === "fixed" ? (
          <label className="field" style={{ maxWidth: 200 }}><span>Raise by</span><input inputMode="decimal" value={fixed} disabled={locked} onChange={x => setFixed(x.target.value)} /></label>
        ) : (
          <table className="table" style={{ maxWidth: 480 }}>
            <thead><tr><th>When the current bid is under</th><th>Raise by</th><th /></tr></thead>
            <tbody>
              {tiers.map((t, i) => (
                <tr key={i}>
                  <td>{i === tiers.length - 1 ? <span className="muted">Anything higher</span> : <input className="input" inputMode="decimal" value={t.below} disabled={locked} onChange={x => setTiers(tiers.map((y, j) => j === i ? { ...y, below: x.target.value } : y))} />}</td>
                  <td><input className="input" inputMode="decimal" value={t.raise} disabled={locked} onChange={x => setTiers(tiers.map((y, j) => j === i ? { ...y, raise: x.target.value } : y))} /></td>
                  <td>{tiers.length > 1 && i < tiers.length - 1 && !locked && <button className="btn small ghost" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {mode === "tiered" && !locked && <button className="btn small" style={{ alignSelf: "flex-start" }} onClick={() => setTiers([...tiers.slice(0, -1), { below: "", raise: "" }, tiers[tiers.length - 1]])}>Add step</button>}
        <p className="hint">Any item can override this with its own “Raise by” amount.</p>
      </div>
      {!locked && <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" onClick={save}>Save rules</button></div>}
    </>
  );
}

// ---------------------------------------------------------------- donations

export function Donations({ ctx }: { ctx: Ctx }) {
  const { data, patchEvent, reload, flash } = ctx, e = data.event;
  const [deadline, setDeadline] = useState(toLocalInput(e.donationDeadline ?? e.endsAt, e.timezone));
  const [name, setName] = useState(""), [description, setDescription] = useState("");
  const total = data.pledges.reduce((s, p) => s + p.amountMinor, 0);
  async function addRecipient(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const r = await api("POST", `/api/v1/host/events/${e.id}/recipients`, { name, description }).catch(() => null);
    if (r?.ok) { setName(""); setDescription(""); reload(); } else flash(r ? errorText(r) : "Connection lost.");
  }
  async function setProcessed(id: string, processed: boolean, note?: string) {
    const r = await api("PATCH", `/api/v1/host/events/${e.id}/pledges/${id}`, { processed, ...(note === undefined ? {} : { note }) }).catch(() => null);
    if (r && !r.ok) flash(errorText(r));
    reload();
  }
  return (
    <>
      <h2>Donations</h2>
      <div className="card pad stack">
        <label className="check"><input type="checkbox" checked={e.donationsEnabled} onChange={x => patchEvent({ donationsEnabled: x.target.checked, donationDeadline: fromLocalInput(deadline, e.timezone) })} /> Let participants donate</label>
        <div className="row wrap" style={{ alignItems: "flex-end" }}>
          <label className="field"><span>Donations close</span><input type="datetime-local" value={deadline} onChange={x => setDeadline(x.target.value)} /></label>
          <button className="btn small" onClick={async () => { if (await patchEvent({ donationDeadline: fromLocalInput(deadline, e.timezone) })) flash("Saved"); }}>Save</button>
        </div>
        <p className="hint">Quick amounts are $25, $50 and $100, or any amount up to $10,000.</p>
      </div>
      <div className="card pad stack">
        <h3>Nonprofits</h3>
        {data.recipients.map(r => (
          <div key={r.id} className="row between"><span><b>{r.name}</b>{r.description && <span className="muted small"> · {r.description}</span>}</span>
            <button className="btn small ghost" onClick={async () => { await api("DELETE", `/api/v1/host/events/${e.id}/recipients/${r.id}`).catch(() => null); reload(); }}>Remove</button></div>
        ))}
        <form className="row wrap" style={{ alignItems: "flex-end" }} onSubmit={addRecipient}>
          <label className="field grow"><span>Nonprofit name</span><input value={name} onChange={x => setName(x.target.value)} placeholder="Red Cross" /></label>
          <label className="field grow"><span>Short note (optional)</span><input value={description} onChange={x => setDescription(x.target.value)} /></label>
          <button className="btn">Add</button>
        </form>
      </div>
      <div className="card pad stack">
        <div className="row between"><h3>Donations received · <span className="money">{formatMoney(total)}</span></h3>
          <a className="btn small" href={`/api/v1/host/events/${e.id}/export/donations`}>Export CSV</a></div>
        {!data.pledges.length ? <p className="muted small">None yet.</p> : (
          <div className="scroll-x"><table className="table">
            <thead><tr><th>Time</th><th>From</th><th>To</th><th>Amount</th><th>Processed</th><th>Note</th></tr></thead>
            <tbody>{data.pledges.map(p => (
              <tr key={p.id}>
                <td className="small">{fmtClock(p.recordedAt, e.timezone)}</td><td>{p.name}<div className="small faint">{p.business}</div></td><td>{p.recipientName}</td>
                <td className="money">{formatMoney(p.amountMinor)}</td>
                <td><input type="checkbox" aria-label="Processed" checked={Boolean(p.processedAt)} onChange={x => setProcessed(p.id, x.target.checked)} /></td>
                <td><input className="input" defaultValue={p.note} placeholder="Add note" onBlur={x => { if (x.target.value !== p.note) setProcessed(p.id, Boolean(p.processedAt), x.target.value); }} /></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- participants

export function People({ ctx, compact = false }: { ctx: Ctx; compact?: boolean }) {
  const { data, reload, flash } = ctx, e = data.event;
  const [query, setQuery] = useState(""), [code, setCode] = useState<{ name: string; code: string } | null>(null);
  const q = query.trim().toLowerCase();
  const shown = data.participants.filter(p => !q || `${p.name} ${p.business}`.toLowerCase().includes(q));
  const setCanBid = async (id: string, canBid: boolean) => {
    const r = await api("PATCH", `/api/v1/host/events/${e.id}/participants/${id}`, { canBid }).catch(() => null);
    if (r && !r.ok) flash(errorText(r)); reload();
  };
  const rejoin = async (id: string, name: string) => {
    const r = await api("POST", `/api/v1/host/events/${e.id}/participants/${id}/rejoin`).catch(() => null);
    if (r?.ok) setCode({ name, code: r.data.code }); else flash(r ? errorText(r) : "Connection lost.");
  };
  return (
    <div className="stack">
      <div className="row between wrap"><h3>Participants · {data.participants.length}</h3>
        <a className="btn small" href={`/api/v1/host/events/${e.id}/export/participants`}>Export CSV</a></div>
      {code && <div className="notice info stack"><span>Rejoin code for <b>{code.name}</b> (valid 30 minutes, one use):</span><span className="joincode" style={{ fontSize: 32 }}>{code.code}</span>
        <span className="small">On the new phone: open the event, tap “Already joined on another phone?”, and enter this code.</span></div>}
      {data.participants.length > 6 && <input className="input" type="search" placeholder="Search by name or business" value={query} onChange={x => setQuery(x.target.value)} />}
      {!data.participants.length ? <p className="muted small">No one has joined yet. Share your code to get started.</p> : compact ? (
        <div className="people">
          {shown.map(p => (
            <div key={p.id} className="person">
              <div className="grow"><b>{p.name}</b><div className="small muted">{p.business} · {p.bidCount} bids{p.leadingCount ? ` · leading ${p.leadingCount}` : ""}</div></div>
              <details className="menu"><summary aria-label={`Options for ${p.name}`}>⋯</summary>
                <div className="menu-pop">
                  <label className="check"><input type="checkbox" checked={p.canBid} onChange={x => setCanBid(p.id, x.target.checked)} /> Can bid</label>
                  <button className="btn small" onClick={() => rejoin(p.id, p.name)}>Rejoin code</button>
                </div>
              </details>
            </div>
          ))}
        </div>
      ) : (
        <div className="card scroll-x"><table className="table">
          <thead><tr><th>Name</th><th>Business</th><th>Joined</th><th>Bids</th><th>Leading</th><th>Donated</th><th>Can bid</th><th /></tr></thead>
          <tbody>{shown.map(p => (
            <tr key={p.id}>
              <td><b>{p.name}</b></td><td>{p.business}</td><td className="small">{fmtClock(p.joinedAt, e.timezone)}</td><td>{p.bidCount}</td><td>{p.leadingCount}</td>
              <td className="money">{p.pledgedMinor ? formatMoney(p.pledgedMinor) : "—"}</td>
              <td><input type="checkbox" aria-label={`${p.name} can bid`} checked={p.canBid} onChange={x => setCanBid(p.id, x.target.checked)} /></td>
              <td><button className="btn small ghost" onClick={() => rejoin(p.id, p.name)}>Rejoin code</button></td>
            </tr>))}</tbody>
        </table></div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- results

function Results({ ctx }: { ctx: Ctx }) {
  const { data } = ctx, e = data.event;
  return (
    <>
      <div className="row between wrap"><h2>Results & winners</h2>
        <div className="row"><a className="btn small" href={`/api/v1/host/events/${e.id}/export/results`}>Export results CSV</a></div></div>
      <p className="muted small">When an item closes, confirm its winner. Confirmed winners see “You won” and your winner instructions.</p>
      <div className="stack">{data.items.filter(i => i.ready || i.bidCount).map(item => <ResultRow key={item.id} ctx={ctx} item={item} />)}</div>
    </>
  );
}

export function ResultRow({ ctx, item }: { ctx: Ctx; item: Item }) {
  const { data, reload, flash } = ctx, tz = data.event.timezone, a = item.award;
  const [choosing, setChoosing] = useState(false), [notes, setNotes] = useState(a?.notes ?? ""), [busy, setBusy] = useState(false);
  useEffect(() => { setNotes(a?.notes ?? ""); }, [a?.revision, a?.notes]);
  const winner = a?.bidId ? item.bids.find(b => b.id === a.bidId) : undefined;
  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    const r = await api("POST", `/api/v1/host/items/${item.id}/award`, { action, revision: a?.revision ?? 0, ...extra }).catch(() => null);
    setBusy(false); setChoosing(false);
    if (r && !r.ok) flash(errorText(r)); else if (!r) flash("Connection lost. Try again — it's safe to repeat.");
    reload();
  }
  return (
    <div className="card pad stack" style={{ gap: 10 }}>
      <div className="row between wrap">
        <div className="row" style={{ gap: 12 }}><span className="faint" style={{ fontFamily: "var(--serif)", fontSize: 22 }}>{String(item.position + 1).padStart(2, "0")}</span><b>{item.title}</b></div>
        <div className="row">
          {a ? <span className={`chip ${a.status === "fulfilled" ? "won" : a.status === "no_winner" ? "closed" : "yours"}`}>{a.status === "fulfilled" ? "Fulfilled" : a.status === "no_winner" ? "No winner" : "Winner confirmed"}</span> : <StageChip stage={item.phase} />}
        </div>
      </div>
      {item.phase !== "closed" ? (
        <p className="small muted">{item.bidCount ? <>High bid <span className="money">{formatMoney(item.currentMinor!)}</span> by {item.leader?.name} · {item.leader?.business}. </> : "No bids yet. "}Closes {fmtTime(item.effectiveClosesAt, tz)}.</p>
      ) : !a ? (
        item.bidCount ? (
          <div className="row wrap">
            <span className="grow">Highest: <b>{item.leader?.name}</b> · {item.leader?.business} · <span className="money">{formatMoney(item.currentMinor!)}</span></span>
            <button className="btn primary small" disabled={busy} onClick={() => act("assign")}>Confirm winner</button>
            <button className="btn small" onClick={() => setChoosing(!choosing)}>Choose another bidder</button>
            <button className="btn small ghost" disabled={busy} onClick={() => act("no_winner")}>No winner</button>
          </div>
        ) : (
          <div className="row"><span className="grow muted">No bids.</span><button className="btn small" disabled={busy} onClick={() => act("no_winner")}>Mark no winner</button></div>
        )
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          {winner && <span>Winner: <b>{winner.name}</b> · {winner.business} · <span className="money">{formatMoney(winner.amountMinor)}</span></span>}
          <div className="row wrap">
            {a.status === "assigned" && <button className="btn primary small" disabled={busy} onClick={() => act("fulfilled")}>Mark fulfilled</button>}
            {a.status === "fulfilled" && <button className="btn small" disabled={busy} onClick={() => act("unfulfilled")}>Undo fulfilled</button>}
            {item.bidCount > 0 && <button className="btn small" onClick={() => setChoosing(!choosing)}>Change winner</button>}
          </div>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <label className="field grow"><span>Follow-up notes</span><input value={notes} onChange={x => setNotes(x.target.value)} placeholder="Picked up Saturday; invoiced in trade" /></label>
            <button className="btn small" disabled={busy || notes === a.notes} onClick={() => act("notes", { notes })}>Save note</button>
          </div>
        </div>
      )}
      {choosing && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="small faint">Pick the bid to award (e.g. if the top bidder withdrew):</span>
          {item.bids.map(b => (
            <div key={b.id} className="row between"><span>{b.name} · {b.business} · <span className="money">{formatMoney(b.amountMinor)}</span> <span className="small faint">{fmtClock(b.at, tz)}</span></span>
              <button className="btn small" disabled={busy || b.id === a?.bidId} onClick={() => act("assign", { bidId: b.id })}>Award</button></div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- share

export function Share({ ctx }: { ctx: Ctx }) {
  const { data, patchEvent } = ctx, e = data.event;
  const [origin, setOrigin] = useState(""), [copied, setCopied] = useState(false);
  useEffect(() => setOrigin(location.origin), []);
  const link = `${origin}/e/${e.code}`;
  const qr = useMemo(() => {
    if (!origin) return "";
    const code = qrcodegen.QrCode.encodeText(link, qrcodegen.QrCode.Ecc.MEDIUM), size = code.size + 8;
    let path = "";
    for (let y = 0; y < code.size; y++) for (let x = 0; x < code.size; x++) if (code.getModule(x, y)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#1A1814"/></svg>`;
  }, [link, origin]);
  return (
    <>
      <h2>Share & entry</h2>
      {e.status === "draft" && <div className="notice warn row between wrap"><span>This event is a draft. Participants can't see it until you go live.</span>
        <button className="btn primary small" onClick={() => patchEvent({ status: "live" })}>Go live</button></div>}
      <div className="card pad row wrap" style={{ gap: 28, alignItems: "center" }}>
        <div className="qr" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label="QR code to join the event" />
        <div className="stack">
          <span className="small faint">Or go to {origin.replace(/^https?:\/\//, "")}/join and enter</span>
          <span className="joincode">{e.code}</span>
          <div className="row wrap">
            <button className="btn" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? "Copied!" : "Copy link"}</button>
            {e.status === "live" && <a className="btn" href={`/e/${e.code}`} target="_blank">Open participant view ↗</a>}
            <button className="btn" onClick={() => window.print()}>Print</button>
          </div>
        </div>
      </div>
      <div className="card pad stack">
        <label className="check"><input type="checkbox" checked={e.entryOpen} onChange={x => patchEvent({ entryOpen: x.target.checked })} /> New people can join</label>
        <p className="hint">Turn this off to stop new sign-ups. People who already joined keep their access until {fmtTime(e.accessEndsAt, e.timezone)}.</p>
      </div>
    </>
  );
}
