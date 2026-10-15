"use client";
// The Items workspace’s two bigger moments, each reviewed before anything is saved:
// pasting a spreadsheet and tidying the category list. (Photos go through the tray: photo-tray.tsx.)
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, errorText, newId, parseDollars } from "../../../lib/api";
import { sameCategory, tidyCategory } from "../../../lib/categories";
import { COLUMN_LABELS, draftsFrom, guessColumns, parseTable, type Column } from "../../../lib/items-paste";
import { IAlert, ICheck, IClose, IDrag, ITrash } from "../../../lib/icons";
import { useReorder } from "../reorder";
import type { SetupCtx } from "./setup";

function Dialog({ title, sub, onClose, children, foot, className = "", busy = false }: { title: string; sub?: ReactNode; onClose: () => void; children: ReactNode; foot?: ReactNode; className?: string; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // showModal() moves focus to the first focusable element (Close), overriding React's autoFocus, which ran while the
  // dialog was still closed. Put focus back on the field marked data-autofocus so staff can type or paste at once.
  useEffect(() => { ref.current?.showModal(); ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(); }, []);
  return (
    <dialog ref={ref} className={`sx-dialog iw-dlg ${className}`} aria-labelledby="iw-dlg-title" onClose={onClose} onCancel={ev => { if (busy) ev.preventDefault(); }}>
      <div className="iw-dlg-head">
        <div><h2 id="iw-dlg-title">{title}</h2>{sub && <p>{sub}</p>}</div>
        <button type="button" className="sx-icon-btn" aria-label="Close" disabled={busy} onClick={() => ref.current?.close()}><IClose size={22} /></button>
      </div>
      <div className="iw-dlg-body">{children}</div>
      {foot && <div className="iw-dlg-foot">{foot}</div>}
    </dialog>
  );
}
const closeDialog = (from: HTMLElement | null) => from?.closest("dialog")?.close();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- paste rows
type Edit = { title?: string; price?: string };

export function PasteDialog({ ctx, initial, onClose, onAdded }: { ctx: SetupCtx; initial: string; onClose: () => void; onAdded: (ids: string[]) => void }) {
  const e = ctx.data.event, live = e.status === "live";
  const [text, setText] = useState(initial);
  const [columns, setColumns] = useState<Column[] | null>(null), [header, setHeader] = useState<boolean | null>(null);
  const [edits, setEdits] = useState<Record<number, Edit>>({}), [skip, setSkip] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const sent = useRef<{ body: string; ids: string[] } | null>(null), foot = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => parseTable(text), [text]);
  const guess = useMemo(() => guessColumns(rows), [rows]);
  const cols = columns && columns.length === guess.columns.length ? columns : guess.columns;
  const hasHeader = header ?? guess.header;
  const drafts = useMemo(() => draftsFrom(rows, cols, hasHeader), [rows, cols, hasHeader]);
  useEffect(() => { setColumns(null); setHeader(null); setEdits({}); setSkip(new Set()); }, [text]);

  const review = drafts.map((d, n) => {
    const ed = edits[n] ?? {};
    const title = (ed.title ?? d.title).trim();
    const openingMinor = ed.price !== undefined ? parseDollars(ed.price) : d.openingMinor;
    const problems = d.problems.filter(p => /longer than|out of range/.test(p));
    if (!title) problems.push("Needs a title");
    if (!openingMinor) problems.push(ed.price !== undefined ? (ed.price.trim() ? "Use an amount like 150" : "Needs a starting bid") : d.problems.find(p => /amount|starting bid/.test(p)) ?? "Needs a starting bid");
    return { ...d, title, openingMinor, problems, n };
  });
  const included = review.filter(r => !skip.has(r.n));
  const blocked = included.filter(r => r.problems.length);
  const ready = included.length > 0 && !blocked.length;
  const width = rows[0]?.length ?? 0;
  const sample = (c: number) => hasHeader ? rows[0]?.[c] || `Column ${c + 1}` : rows.find(r => r[c])?.[c] ?? `Column ${c + 1}`;

  async function add() {
    setBusy(true); setError("");
    const payload = included.map(r => ({ title: r.title, openingMinor: r.openingMinor, category: tidyCategory(r.category), donor: r.donor, short: r.short, description: r.description }));
    // Batches stay under the request size limit; each has its own retry-safe ID, kept while the rows are unchanged.
    const chunks: typeof payload[] = [];
    let chunk: typeof payload = [], size = 0;
    for (const p of payload) { const s = JSON.stringify(p).length; if (chunk.length && (chunk.length >= 100 || size + s > 48_000)) { chunks.push(chunk); chunk = []; size = 0; } chunk.push(p); size += s; }
    if (chunk.length) chunks.push(chunk);
    const body = JSON.stringify(chunks);
    if (sent.current?.body !== body) sent.current = { body, ids: chunks.map(() => newId()) };
    const ids: string[] = [];
    for (const [n, items] of chunks.entries()) {
      let message = "";
      const ok = await ctx.track(async () => {
        const r = await api("POST", `/api/v1/host/events/${e.id}/items/batch`, { requestId: sent.current!.ids[n], items });
        if (r.ok) ids.push(...r.data.ids); else message = errorText(r);
        return { ok: r.ok, message: r.ok ? undefined : message };
      });
      if (!ok) {
        setBusy(false);
        setError(`${message || "Connection lost."} ${ids.length ? `${plural(ids.length, "item")} were added; try again for the rest. Nothing will be added twice.` : "Nothing was added. Try again; nothing will be added twice."}`);
        return;
      }
    }
    setBusy(false);
    ctx.flash(live ? `${plural(ids.length, "item")} added, hidden from guests. They’re selected: show them when they’re ready.` : `${plural(ids.length, "item")} added`, "green");
    onAdded(ids);
    closeDialog(foot.current);
  }

  return (
    <Dialog title="Add items from a spreadsheet" onClose={onClose} busy={busy} className="paste-dlg"
      sub={rows.length ? <>Check the columns and rows, then add them. {live ? "This event is published, so new items start hidden." : "They’ll be visible when you go live."}</> : "Copy rows from Excel, Google Sheets or Numbers and paste them here. A header row is optional."}
      foot={<div ref={foot} className="pd-foot">
        {error && <p className="sx-error" role="alert">{error}</p>}
        {rows.length > 0 && <span className="pd-count">{blocked.length ? <><IAlert size={16} />{plural(blocked.length, "row")} to fix or leave out</> : included.length ? <><ICheck size={16} />{plural(included.length, "item")} ready</> : "No rows selected"}</span>}
        {rows.length > 0 && <button type="button" className="sx-btn ghost" disabled={busy} onClick={() => setText("")}>Paste different rows</button>}
        <button type="button" className="sx-btn primary" disabled={!ready || busy} onClick={add}>{busy ? "Adding…" : `Add ${included.length ? plural(included.length, "item") : "items"}`}</button>
      </div>}>
      {!rows.length ? (
        <textarea className="pd-paste" data-autofocus value={text} onChange={ev => setText(ev.target.value)} aria-label="Paste spreadsheet rows here"
          placeholder={"Item\tStarting bid\tCategory\tProvided by\nWeekend cabin\t$400\tTravel\tJuniper Cabins\nCoffee for a year\t$200\tFood & drink\tHarbor Roasters"} />
      ) : (
        <>
          <div className="pd-map">
            <label className="pd-header"><input type="checkbox" className="sx-check" checked={hasHeader} onChange={ev => setHeader(ev.target.checked)} />First row is a header</label>
            <div className="pd-cols" role="group" aria-label="What each column holds">
              {[...Array(width).keys()].map(c => (
                <label key={c} className={`pd-col${cols[c] === "skip" ? " off" : ""}`}><small title={sample(c)}>{sample(c)}</small>
                  <select value={cols[c]} onChange={ev => { const next = [...cols]; const v = ev.target.value as Column; if (v !== "skip") next.forEach((x, k) => { if (x === v) next[k] = "skip"; }); next[c] = v; setColumns(next); }}>
                    {(Object.keys(COLUMN_LABELS) as Column[]).map(k => <option key={k} value={k}>{COLUMN_LABELS[k]}</option>)}
                  </select></label>
              ))}
            </div>
          </div>
          <div className="pd-table" role="table" aria-label="Rows to add">
            <div className="pd-row pd-h" role="row"><span role="columnheader"><span className="sr-only">Include</span></span><span role="columnheader">Title</span><span role="columnheader">Starting bid</span><span role="columnheader">Category</span><span role="columnheader">Provided by</span></div>
            {review.map(r => {
              const off = skip.has(r.n);
              return (
                <div key={r.n} role="row" className={`pd-row${off ? " off" : ""}${r.problems.length && !off ? " bad" : ""}`}>
                  <span role="cell"><input type="checkbox" className="sx-check" checked={!off} aria-label={`Include row ${r.n + 1}`} onChange={() => setSkip(s => { const x = new Set(s); x.has(r.n) ? x.delete(r.n) : x.add(r.n); return x; })} /></span>
                  <span role="cell" className="pd-title">
                    <input value={edits[r.n]?.title ?? r.title} aria-label={`Row ${r.n + 1} title`} maxLength={200} disabled={off} onChange={ev => setEdits(x => ({ ...x, [r.n]: { ...x[r.n], title: ev.target.value } }))} />
                    {r.problems.length > 0 && !off && <small className="pd-prob">{r.problems.join(" · ")}</small>}
                  </span>
                  <span role="cell" className="pd-price"><b>$</b><input inputMode="decimal" value={edits[r.n]?.price ?? (r.openingMinor ? String(r.openingMinor / 100) : "")} aria-label={`Row ${r.n + 1} starting bid`} disabled={off}
                    onChange={ev => setEdits(x => ({ ...x, [r.n]: { ...x[r.n], price: ev.target.value } }))} /></span>
                  <span role="cell" className="pd-t">{r.category || <i>—</i>}</span>
                  <span role="cell" className="pd-t">{r.donor || <i>—</i>}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------- categories
export function CategoriesDialog({ ctx, onClose, onPick }: { ctx: SetupCtx; onClose: () => void; onPick: (name: string) => void }) {
  const { data, track } = ctx, e = { ...data.event, categories: data.event.categories ?? [] };
  const counts = useMemo(() => { const m = new Map<string, number>(); for (const i of data.items) if (i.category) m.set(i.category, (m.get(i.category) ?? 0) + 1); return m; }, [data.items]);
  const [fresh, setFresh] = useState(""), [ask, setAsk] = useState<{ kind: "merge"; from: string; into: string } | { kind: "remove"; name: string } | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const list = useRef<HTMLUListElement>(null);
  const call = (body: Record<string, unknown>) => track(async () => {
    const r = await api("POST", `/api/v1/host/events/${e.id}/categories`, body);
    return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
  });
  const reorder = useReorder({ ids: e.categories, enabled: e.categories.length > 1, container: list, labels: n => n, onMove: (name, to) => {
    const next = e.categories.filter(c => c !== name); next.splice(to, 0, name);
    ctx.apply(d => ({ ...d, event: { ...d.event, categories: next } }));
    void call({ action: "order", names: next });
  } });
  const rename = (from: string, raw: string) => {
    const to = tidyCategory(raw);
    setNames(x => { const { [from]: _, ...rest } = x; return rest; });
    if (!to || to === from) return;
    const into = e.categories.find(c => c !== from && sameCategory(c, to));
    if (into) { setAsk({ kind: "merge", from, into }); return; }
    void call({ action: "rename", from, to });
  };
  return (
    <Dialog title="Categories" onClose={onClose} className="cat-dlg"
      sub="Guests filter by these, in this order. Rename one to merge it into another.">
      {ask && (
        <div className="cat-ask" role="alertdialog" aria-label="Confirm">
          {ask.kind === "merge"
            ? <p>Merge <b>{ask.from}</b> into <b>{ask.into}</b>? {plural(counts.get(ask.from) ?? 0, "item")} will move.</p>
            : <p>Remove <b>{ask.name}</b>? {plural(counts.get(ask.name) ?? 0, "item")} will have no category. The items stay.</p>}
          <button type="button" className={`sx-btn sm ${ask.kind === "remove" ? "danger" : "primary"}`} onClick={() => {
            void call(ask.kind === "merge" ? { action: "rename", from: ask.from, to: ask.into } : { action: "remove", name: ask.name }); setAsk(null);
          }}>{ask.kind === "merge" ? "Merge" : "Remove"}</button>
          <button type="button" className="sx-btn ghost sm" onClick={() => setAsk(null)}>Cancel</button>
        </div>
      )}
      {e.categories.length ? (
        <ul className="cat-rows" ref={list}>
          {e.categories.map(c => (
            <li key={c} data-reorder-id={c} className={reorder.rowClass(c)}>
              <button type="button" className="grip" {...reorder.handle(c)}><IDrag size={16} /></button>
              <input value={names[c] ?? c} aria-label={`Rename ${c}`} maxLength={100}
                onChange={ev => setNames(x => ({ ...x, [c]: ev.target.value }))}
                onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") setNames(x => { const { [c]: _, ...rest } = x; return rest; }); }}
                onBlur={ev => rename(c, ev.target.value)} />
              <button type="button" className="cat-count" onClick={() => onPick(c)} title="Show these items">{plural(counts.get(c) ?? 0, "item")}</button>
              <button type="button" className="sx-icon-btn sm" aria-label={`Remove ${c}`} onClick={() => (counts.get(c) ?? 0) ? setAsk({ kind: "remove", name: c }) : void call({ action: "remove", name: c })}><ITrash size={16} /></button>
            </li>
          ))}
          {reorder.dropAtEnd && <li className="drop-end" aria-hidden="true" />}
        </ul>
      ) : <p className="sx-muted">No categories yet. Add a few here, or type one into any item.</p>}
      <form className="cat-add" onSubmit={ev => { ev.preventDefault(); const n = tidyCategory(fresh); if (n) { void call({ action: "add", name: n }); setFresh(""); } }}>
        <input value={fresh} onChange={ev => setFresh(ev.target.value)} placeholder="New category, e.g. Travel" aria-label="New category" maxLength={100} />
        <button type="submit" className="sx-btn" disabled={!tidyCategory(fresh)}>Add</button>
      </form>
      <p className="sr-only" aria-live="assertive">{reorder.status}</p>
    </Dialog>
  );
}
