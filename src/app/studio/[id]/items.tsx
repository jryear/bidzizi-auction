"use client";
// The Items workspace: every item on one full-width sheet. Type straight into a row (each field saves when you leave it),
// add rows as fast as you can type, paste a spreadsheet, drop a folder of photos, and act on many items at once.
// The phone beside it renders the guests' own components, so what staff see is what guests get.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api, dollarsInput, errorText, newId, parseDollars } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { CENTER, photoStyle } from "../../../lib/photo";
import { looksLikeRows } from "../../../lib/items-paste";
import { usePhotoUpload } from "../../../lib/use-photo-upload";
import { IAlert, ICheck, IChevL, IChevR, IClose, IDrag, IEye, IEyeOff, IMore, IPhone, IPhoto, IPlus, ISearch, ITrash, IUpload } from "../../../lib/icons";
import { uploadPhoto, type Item } from "../data";
import { Seg } from "../kit";
import { CategoryInput } from "../category-input";
import { ReorderHelp, useMoveItem, useReorder } from "../reorder";
import { Canvas, selToUrl, type ItemFilter, type Screen, type Sel, type SetupCtx } from "./setup";
import { CategoriesDialog, PasteDialog, PhotoDialog } from "./items-dialogs";

type Props = { ctx: SetupCtx; sel: Extract<Sel, { kind: "items" }>; select: (s: Sel, sc?: Screen) => void };
type Col = "title" | "category" | "donor" | "start";
const COLS: Col[] = ["title", "category", "donor", "start"];

const closed = (i: Item) => i.withdrawn || i.phase === "closed";
const PASS: Record<ItemFilter, (i: Item) => boolean> = {
  all: () => true, visible: i => i.ready, hidden: i => !i.ready, bids: i => i.bidCount > 0, closed, nophoto: i => !i.imageUrl,
};
const FILTER_LABEL: Record<ItemFilter, string> = { all: "All", visible: "Visible", hidden: "Hidden", bids: "Has bids", closed: "Closed", nophoto: "No photo" };
const lot = (i: Pick<Item, "position">) => String(i.position + 1).padStart(2, "0");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A remembered per-device preference (the phone preview's visibility). */
function usePref(key: string, initial: () => boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(false);
  useEffect(() => { try { const s = localStorage.getItem(key); setV(s === null ? initial() : s === "1"); } catch { setV(initial()); } }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, next => { setV(next); try { localStorage.setItem(key, next ? "1" : "0"); } catch { /* ignore */ } }];
}

export function ItemsWorkspace({ ctx, sel, select }: Props) {
  const { data, track, flash, current } = ctx, e = data.event, items = data.items, live = e.status === "live";
  const [query, setQuery] = useState("");
  const [filter, setFilterState] = useState<ItemFilter>(sel.filter ?? "all");
  const [cat, setCat] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const anchor = useRef<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [preview, setPreview] = usePref("bz_items_preview", () => innerWidth >= 1360);
  const [pane, setPane] = useState<"list" | "phone">("list");
  const [screen, setScreen] = useState<Screen>("items");
  const [pasting, setPasting] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[] | null>(null);
  const [managing, setManaging] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; undo?: () => void } | null>(null);
  const sheet = useRef<HTMLDivElement>(null), fileInput = useRef<HTMLInputElement>(null), addTitle = useRef<HTMLInputElement>(null);
  const move = useMoveItem(ctx);

  const setFilter = (f: ItemFilter) => { setFilterState(f); history.replaceState(null, "", `?mode=setup${selToUrl({ kind: "items", filter: f })}`); };
  useEffect(() => { if (sel.filter) setFilterState(sel.filter); }, [sel.filter]);
  useEffect(() => { if (sel.focus === "add") requestAnimationFrame(() => addTitle.current?.focus()); }, [sel.focus]);
  // Selections and focus follow the items that still exist.
  useEffect(() => {
    const ids = new Set(items.map(i => i.id));
    setSelected(s => { const next = new Set([...s].filter(id => ids.has(id))); return next.size === s.size ? s : next; });
    if (focused && !ids.has(focused)) setFocused(null);
  }, [items, focused]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 9000); return () => clearTimeout(t); }, [notice]);

  const counts = useMemo(() => {
    const byFilter = Object.fromEntries((Object.keys(PASS) as ItemFilter[]).map(f => [f, items.filter(PASS[f]).length])) as Record<ItemFilter, number>;
    const byCat = new Map<string, number>(); let none = 0;
    for (const i of items) if (i.category) byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1); else none++;
    return { byFilter, byCat, none };
  }, [items]);
  const categories = e.categories ?? [];
  const q = query.trim().toLowerCase();
  const list = items.filter(i => PASS[filter](i) && (cat === null || i.category === cat)
    && (!q || `${lot(i)} ${i.title} ${i.short} ${i.donor} ${i.category}`.toLowerCase().includes(q)));
  const narrowed = Boolean(q) || filter !== "all" || cat !== null;
  const reorder = useReorder({ ids: items.map(i => i.id), enabled: !narrowed && items.length > 1, onMove: move, container: sheet, labels: id => items.find(i => i.id === id)?.title ?? "item" });

  // ---------------------------------------------------------------- selection
  const toggle = (id: string, range: boolean) => setSelected(prev => {
    const next = new Set(prev);
    if (range && anchor.current) {
      const a = list.findIndex(i => i.id === anchor.current), b = list.findIndex(i => i.id === id);
      if (a >= 0 && b >= 0) { const on = !prev.has(id); for (const i of list.slice(Math.min(a, b), Math.max(a, b) + 1)) on ? next.add(i.id) : next.delete(i.id); return next; }
    }
    next.has(id) ? next.delete(id) : next.add(id);
    anchor.current = id;
    return next;
  });
  const allShown = list.length > 0 && list.every(i => selected.has(i.id));
  const someShown = list.some(i => selected.has(i.id));
  const picked = items.filter(i => selected.has(i.id));
  const clear = () => { setSelected(new Set()); setSelecting(false); };

  // ---------------------------------------------------------------- bulk actions
  const bulk = async (changes: Record<string, unknown>[], say: (updated: number, skipped: { id: string; reason: string }[]) => string) => {
    let summary = "";
    const ok = await track(async () => {
      const r = await api("PATCH", `/api/v1/host/events/${e.id}/items`, { changes });
      if (r.ok) summary = say(r.data.updated.length, r.data.skipped);
      return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
    });
    if (ok && summary) flash(summary, "green");
    return ok;
  };
  const setCategory = (ids: string[], name: string) => bulk(ids.map(id => ({ id, category: name })),
    n => name ? `${plural(n, "item")} moved to ${name}` : `Category removed from ${plural(n, "item")}`);
  const setVisible = (ids: string[], ready: boolean) => bulk(ids.map(id => ({ id, ready })), (n, skipped) =>
    `${ready ? "Showing" : "Hid"} ${plural(n, "item")}${ready ? " to guests" : ""}${skipped.length ? `. ${plural(skipped.length, "item")} with bids stay${skipped.length === 1 ? "s" : ""} visible` : ""}`);
  const remove = async (ids: string[]) => {
    let summary = "";
    const ok = await track(async () => {
      const r = await api("POST", `/api/v1/host/events/${e.id}/items/delete`, { itemIds: ids });
      if (r.ok) summary = `Deleted ${plural(r.data.deleted.length + r.data.alreadyGone.length, "item")}${r.data.kept.length ? `. Kept ${plural(r.data.kept.length, "item")} people have bid on` : ""}`;
      return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
    });
    if (ok) { flash(summary, "green"); clear(); }
  };

  /** Rearrange the whole list by a rule, with a moment to undo. */
  const arrange = (label: string, compare: (a: Item, b: Item) => number) => {
    const before = items.map(i => i.id);
    const save = (order: () => string[]) => {
      const ids = order(), byId = new Map(current().items.map(i => [i.id, i]));
      ctx.apply(d => ({ ...d, items: ids.filter(id => byId.has(id)).map((id, position) => ({ ...byId.get(id)!, position })) }));
      void track(async () => {
        const known = new Set(current().items.map(i => i.id));
        const next = [...ids.filter(id => known.has(id)), ...current().items.map(i => i.id).filter(id => !ids.includes(id))];
        const r = await api("POST", `/api/v1/host/events/${e.id}/items/order`, { order: next });
        return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
      });
    };
    save(() => [...current().items].sort((a, b) => compare(a, b) || a.position - b.position).map(i => i.id));
    setNotice({ text: `Arranged ${label}. Item numbers follow the new order.`, undo: () => { save(() => before); setNotice(null); } });
  };
  const rank = (c: string) => { const n = categories.indexOf(c); return c ? (n < 0 ? categories.length : n) : categories.length + 1; };

  // ---------------------------------------------------------------- keyboard movement between cells
  const focusCell = useCallback((row: number, col: Col) => {
    const el = sheet.current?.querySelector<HTMLInputElement>(`[data-cell="${row}:${col}"]`);
    if (el) { el.focus(); el.select?.(); return true; }
    return false;
  }, []);
  const nav = (row: number, col: Col) => (key: "Enter" | "ArrowUp" | "ArrowDown", shift: boolean) => {
    const to = key === "ArrowUp" || (key === "Enter" && shift) ? row - 1 : row + 1;
    if (to < 0) return;
    if (!focusCell(to, col) && to >= list.length) focusCell(list.length, col === "title" || col === "start" || col === "category" || col === "donor" ? col : "title");
  };

  // ---------------------------------------------------------------- files dropped on the sheet
  const takeFiles = (files: FileList | File[] | null | undefined) => {
    const images = [...(files ?? [])].filter(f => f.type.startsWith("image/"));
    if (!images.length) { if (files && [...files].length) flash("Those files aren't images. Use JPEG, PNG or WebP.", "red"); return; }
    if (!items.length) { flash("Add items first, then drop their photos here to match them.", "red"); return; }
    setPhotos(images);
  };

  const hiddenCount = counts.byFilter.hidden, noPhoto = counts.byFilter.nophoto, visibleCount = counts.byFilter.visible;
  const focusedItem = focused ? items.find(i => i.id === focused) : undefined;

  return (
    <div className={`iw${preview ? " with-preview" : ""} pane-${pane}`}>
      <section className="iw-main" aria-label="Items"
        onDragEnter={ev => { if (ev.dataTransfer.types.includes("Files")) { ev.preventDefault(); setDropping(true); } }}
        onDragOver={ev => { if (ev.dataTransfer.types.includes("Files")) ev.preventDefault(); }}
        onDragLeave={ev => { if (ev.currentTarget === ev.target || !ev.currentTarget.contains(ev.relatedTarget as Node)) setDropping(false); }}
        onDrop={ev => { if (!ev.dataTransfer.files.length) return; ev.preventDefault(); setDropping(false); takeFiles(ev.dataTransfer.files); }}>
        <header className="iw-head">
          <button type="button" className="sx-btn ghost sm iw-back" onClick={() => select({ kind: "event" }, "welcome")}><IChevL size={16} />Event setup</button>
          <div className="iw-title">
            <h1>Items <span>{items.length}</span></h1>
            <p className="iw-sum">{!items.length ? "Nothing yet. Type a row below, or paste from a spreadsheet."
              : <>{live ? <><b className="ok">{visibleCount} visible to guests</b>{hiddenCount > 0 && <> · <button type="button" className="link warn" onClick={() => setFilter("hidden")}>{hiddenCount} hidden</button></>}</>
                : <>{hiddenCount ? <>{visibleCount} will show when you go live · <button type="button" className="link" onClick={() => setFilter("hidden")}>{hiddenCount} hidden</button></> : <>Guests see all {items.length} once you go live</>}</>}
                {noPhoto > 0 && <> · <button type="button" className="link" onClick={() => setFilter("nophoto")}>{noPhoto} need{noPhoto === 1 ? "s" : ""} a photo</button></>}</>}</p>
          </div>
          <div className="iw-acts">
            <button type="button" className="sx-btn" onClick={() => fileInput.current?.click()} disabled={!items.length} title={items.length ? "Match many photos to items at once" : "Add items first"}><IPhoto size={17} /><span>Add photos</span></button>
            <button type="button" className="sx-btn" onClick={() => setPasting("")}><IUpload size={17} /><span>Paste rows</span></button>
            <ArrangeMenu disabled={items.length < 2} onArrange={(how) => {
              if (how === "category") arrange("by category", (a, b) => rank(a.category) - rank(b.category));
              if (how === "title") arrange("by title, A to Z", (a, b) => a.title.localeCompare(b.title, "en", { numeric: true, sensitivity: "base" }));
              if (how === "price") arrange("by starting bid, lowest first", (a, b) => a.openingMinor - b.openingMinor);
            }} onCategories={() => setManaging(true)} />
            {items.length > 0 && <button type="button" className={`sx-btn iw-select-mode${selecting ? " on" : ""}`} aria-pressed={selecting} onClick={() => selecting ? clear() : setSelecting(true)}>{selecting ? "Done" : "Select"}</button>}
            <button type="button" className={`sx-btn iw-phone-btn${preview ? " on" : ""}`} aria-pressed={preview} onClick={() => setPreview(!preview)}><IPhone size={17} /><span>{preview ? "Hide phone" : "Show phone"}</span></button>
          </div>
          <div className="iw-panes"><Seg label="View" value={pane} onChange={setPane} options={[{ id: "list", label: "List" }, { id: "phone", label: "Guest phone" }]} /></div>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={ev => { takeFiles(ev.target.files); ev.target.value = ""; }} />
        </header>

        {notice && <div className="iw-notice" role="status"><ICheck size={16} /><span>{notice.text}</span>{notice.undo && <button type="button" className="sx-btn sm" onClick={notice.undo}>Undo</button>}<button type="button" className="sx-icon-btn sm" aria-label="Dismiss" onClick={() => setNotice(null)}><IClose size={16} /></button></div>}

        {items.length > 0 && (
          <div className="iw-filters">
            <label className="sx-search iw-search"><ISearch size={18} /><input type="search" value={query} onChange={ev => setQuery(ev.target.value)} placeholder="Search titles, providers, numbers" aria-label="Search items" /></label>
            <div className="iw-chips" role="group" aria-label="Show">
              {(Object.keys(PASS) as ItemFilter[]).filter(f => f === "all" || counts.byFilter[f] > 0 || filter === f).map(f => (
                <button type="button" key={f} className={`fchip${filter === f ? " on" : ""}${f === "hidden" && live ? " warn" : ""}`} aria-pressed={filter === f} onClick={() => setFilter(filter === f && f !== "all" ? "all" : f)}>
                  {FILTER_LABEL[f]}<small>{counts.byFilter[f]}</small></button>
              ))}
            </div>
          </div>
        )}
        {items.length > 0 && (
          <div className="iw-cats" role="group" aria-label="Category">
            <span className="iw-cats-l">Category</span>
            <button type="button" className={`cchip${cat === null ? " on" : ""}`} aria-pressed={cat === null} onClick={() => setCat(null)}>All</button>
            {categories.map(c => (
              <button type="button" key={c} className={`cchip${cat === c ? " on" : ""}`} aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}>{c}<small>{counts.byCat.get(c) ?? 0}</small></button>
            ))}
            {counts.none > 0 && categories.length > 0 && <button type="button" className={`cchip none${cat === "" ? " on" : ""}`} aria-pressed={cat === ""} onClick={() => setCat(cat === "" ? null : "")}>No category<small>{counts.none}</small></button>}
            <button type="button" className="cchip manage" onClick={() => setManaging(true)}>{categories.length ? "Manage" : "+ Categories"}</button>
          </div>
        )}

        <div className="iw-sheet" ref={sheet} role="table" aria-label={`Items, ${narrowed ? `${list.length} of ${items.length} shown` : `${items.length} in guests’ order`}`} aria-rowcount={list.length + 1}>
          <div className="iw-row iw-headrow" role="row">
            <span role="columnheader" className="c-sel">
              <input type="checkbox" className="sx-check" aria-label={allShown ? "Clear selection" : `Select all ${list.length} shown`} checked={allShown} disabled={!list.length}
                ref={el => { if (el) el.indeterminate = someShown && !allShown; }} onChange={() => setSelected(allShown ? new Set() : new Set([...selected, ...list.map(i => i.id)]))} />
            </span>
            <span role="columnheader" className="c-grip" title={narrowed ? "Clear search and filters to reorder" : "Drag to reorder"} />
            <span role="columnheader" className="c-no">#</span>
            <span role="columnheader" className="c-photo">Photo</span>
            <span role="columnheader" className="c-title">Title</span>
            <span role="columnheader" className="c-cat">Category</span>
            <span role="columnheader" className="c-donor">Provided by</span>
            <span role="columnheader" className="c-start">Starting bid</span>
            <span role="columnheader" className="c-vis">Guests</span>
            <span role="columnheader" className="c-status">Bids</span>
            <span role="columnheader" className="c-open"><span className="sr-only">Open</span></span>
          </div>
          {list.map((item, row) => (
            <ItemLine key={item.id} item={item} row={row} ctx={ctx} live={live} categories={categories} counts={counts.byCat}
              selected={selected.has(item.id)} selecting={selecting} onSelect={range => toggle(item.id, range)}
              rowClass={reorder.rowClass(item.id)} handle={reorder.handle(item.id)} reorderable={!narrowed}
              onFocus={() => setFocused(item.id)} focused={focused === item.id} nav={nav}
              onMoveKey={dir => { const at = items.findIndex(i => i.id === item.id); if (!narrowed) move(item.id, at + dir); }}
              onOpen={() => select({ kind: "item", id: item.id }, "item")} />
          ))}
          {reorder.dropAtEnd && <div className="iw-drop-end" aria-hidden="true" />}
          {narrowed && !list.length && (
            <div className="iw-empty-filter"><b>No items match</b><span>{q ? <>Nothing matches &ldquo;{query}&rdquo;{filter !== "all" || cat !== null ? " with these filters" : ""}.</> : "No items match these filters."}</span>
              <button type="button" className="sx-btn sm" onClick={() => { setQuery(""); setFilter("all"); setCat(null); }}>Show all items</button></div>
          )}
          <AddRow ctx={ctx} row={list.length} live={live} categories={categories} counts={counts.byCat} titleRef={addTitle} nav={nav}
            defaultCategory={cat ?? ""} onPasteRows={text => setPasting(text)} first={!items.length}
            onAdded={title => { if (narrowed) flash(`Added “${title}”. Clear the search or filters to see it.`); }} />
        </div>
        {!items.length && <EmptyHelp onPaste={() => setPasting("")} onType={() => addTitle.current?.focus()} />}
        <ReorderHelp />
        <p className="sr-only" aria-live="assertive">{reorder.status}</p>
        {narrowed && items.length > 1 && <p className="iw-foot">Reordering is off while a search or filter is on, so nothing moves out of sight. <button type="button" className="link" onClick={() => { setQuery(""); setFilter("all"); setCat(null); }}>Show all to reorder</button></p>}

        {(picked.length > 0) && (
          <BulkBar count={picked.length} total={list.length} live={live} categories={categories} counts={counts.byCat}
            withBids={picked.filter(i => i.hasBids).length}
            onAll={() => setSelected(new Set([...selected, ...list.map(i => i.id)]))} onClear={clear}
            onCategory={name => setCategory(picked.map(i => i.id), name)}
            onShow={() => setVisible(picked.filter(i => !i.ready).map(i => i.id), true)} canShow={picked.some(i => !i.ready)}
            onHide={() => setVisible(picked.filter(i => i.ready).map(i => i.id), false)} canHide={picked.some(i => i.ready)}
            onDelete={() => remove(picked.map(i => i.id))} />
        )}
        {dropping && <div className="iw-dropzone" aria-hidden="true"><IPhoto size={34} /><b>Drop photos to match them to items</b><span>By item number or title in the file name, or in order. You&rsquo;ll check every match first.</span></div>}
      </section>

      {preview && (
        <aside className="iw-preview" aria-label="Guest phone preview">
          <Canvas ctx={ctx} sel={focusedItem ? { kind: "item", id: focusedItem.id } : { kind: "items" }} screen={screen} setScreen={setScreen} addItem={() => addTitle.current?.focus()}
            select={(s, sc) => { if (s.kind === "item") setFocused(s.id); if (sc) setScreen(sc); }} />
        </aside>
      )}

      {pasting !== null && <PasteDialog ctx={ctx} initial={pasting} onClose={() => setPasting(null)} onAdded={ids => { setSelected(new Set(ids)); setFilter("all"); setCat(null); setQuery(""); }} />}
      {photos && <PhotoDialog ctx={ctx} files={photos} onClose={() => setPhotos(null)} />}
      {managing && <CategoriesDialog ctx={ctx} onClose={() => setManaging(false)} onPick={c => { setCat(c); setManaging(false); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- one row
function ItemLine({ item, row, ctx, live, categories, counts, selected, selecting, onSelect, rowClass, handle, reorderable, onFocus, focused, nav, onMoveKey, onOpen }: {
  item: Item; row: number; ctx: SetupCtx; live: boolean; categories: string[]; counts: Map<string, number>;
  selected: boolean; selecting: boolean; onSelect: (range: boolean) => void; rowClass: string; handle: Record<string, unknown>; reorderable: boolean;
  onFocus: () => void; focused: boolean; nav: (row: number, col: Col) => (key: "Enter" | "ArrowUp" | "ArrowDown", shift: boolean) => void;
  onMoveKey: (dir: -1 | 1) => void; onOpen: () => void;
}) {
  const { patchItem, flash } = ctx, locked = item.bidCount > 0;
  const p = (f: Record<string, unknown>) => patchItem(item, f);
  const moveKey = (e: KeyboardEvent) => { if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown") && reorderable) { e.preventDefault(); onMoveKey(e.key === "ArrowUp" ? -1 : 1); } };
  return (
    <div role="row" data-reorder-id={item.id} aria-selected={selected}
      className={`iw-row${selected ? " is-sel" : ""}${item.ready ? "" : " is-hidden"}${focused ? " is-focus" : ""}${selecting ? " selecting" : ""} ${rowClass}`}
      onFocus={onFocus} onKeyDown={moveKey}>
      <span role="cell" className="c-sel"><input type="checkbox" className="sx-check" checked={selected} aria-label={`Select ${item.title}`}
        onClick={ev => onSelect(ev.shiftKey)} onChange={() => {}} /></span>
      <span role="cell" className="c-grip"><button type="button" className="grip" {...handle}><IDrag size={16} /></button></span>
      <span role="cell" className="c-no">{lot(item)}</span>
      <span role="cell" className="c-photo"><PhotoCell ctx={ctx} item={item} /></span>
      <span role="cell" className="c-title">
        <TextCell value={item.title} label={`Title of item ${lot(item)}`} cell={`${row}:title`} max={200} required onEmpty={() => flash("An item needs a title.", "red")}
          onSave={v => p({ title: v })} nav={nav(row, "title")} className="t-title" />
        <button type="button" className="t-open" onClick={onOpen}>{item.title}</button>
        <span className="t-meta">{item.category || "No category"} · {formatMoney(item.openingMinor)}{item.bidCount ? ` · ${plural(item.bidCount, "bid")}, top ${formatMoney(item.currentMinor!)}` : item.donor ? ` · ${item.donor}` : ""}</span>
      </span>
      <span role="cell" className="c-cat">
        <CategoryInput value={item.category} categories={categories} counts={counts} label={`Category of ${item.title}`} placeholder="—"
          inputProps={{ "data-cell": `${row}:category`, className: "cell-in" }} onSave={v => p({ category: v })} onNav={nav(row, "category")} />
      </span>
      <span role="cell" className="c-donor"><TextCell value={item.donor} label={`Provided by, ${item.title}`} cell={`${row}:donor`} max={200} placeholder="—" onSave={v => p({ donor: v })} nav={nav(row, "donor")} /></span>
      <span role="cell" className="c-start"><MoneyCell minor={item.openingMinor} label={`Starting bid of ${item.title}`} cell={`${row}:start`} locked={locked} onSave={v => p({ openingMinor: v })} nav={nav(row, "start")} /></span>
      <span role="cell" className="c-vis"><VisToggle item={item} live={live} onChange={ready => p({ ready })} /></span>
      <span role="cell" className="c-status"><BidsText item={item} /></span>
      <span role="cell" className="c-open"><button type="button" className="sx-icon-btn sm" aria-label={`Open ${item.title}`} onClick={onOpen}><IChevR size={18} /></button></span>
    </div>
  );
}

function BidsText({ item }: { item: Item }) {
  if (item.withdrawn) return <span className="bids muted">Withdrawn</span>;
  if (item.bidCount) return <span className="bids"><small className="bids-top">Top</small><b>{formatMoney(item.currentMinor!)}</b><small>{plural(item.bidCount, "bid")}{item.phase === "closed" ? " · closed" : ""}</small></span>;
  return <span className="bids muted">{item.phase === "closed" ? "Closed" : "None yet"}</span>;
}

/** Visible / Hidden, as a button. Items people have bid on stay visible. */
function VisToggle({ item, live, onChange }: { item: Item; live: boolean; onChange: (ready: boolean) => void }) {
  const locked = item.bidCount > 0 && item.ready;
  return (
    <button type="button" role="switch" aria-checked={item.ready} disabled={locked}
      className={`vis-t${item.ready ? " on" : ""}${live ? " live" : ""}`} onClick={() => onChange(!item.ready)}
      title={locked ? "Items with bids stay visible" : item.ready ? (live ? "Guests can see this. Click to hide it." : "Will show when you go live. Click to hide it.") : "Hidden from guests. Click to show it."}>
      {item.ready ? <IEye size={15} /> : <IEyeOff size={15} />}<span>{item.ready ? "Visible" : live ? "Show" : "Hidden"}</span>
    </button>
  );
}

// ---------------------------------------------------------------- cells
/** Reports unsaved typing to the Studio's save indicator. */
function useDirty() {
  const field = useId();
  const mark = useCallback((dirty: boolean) => { dispatchEvent(new CustomEvent("bz:editing", { detail: { field, dirty } })); }, [field]);
  useEffect(() => () => mark(false), [mark]);
  return mark;
}

function TextCell({ value, onSave, label, cell, max, placeholder, nav, className = "", required = false, onEmpty }: {
  value: string; onSave: (v: string) => Promise<boolean>; label: string; cell: string; max: number; placeholder?: string;
  nav: (key: "Enter" | "ArrowUp" | "ArrowDown", shift: boolean) => void; className?: string; required?: boolean; onEmpty?: () => void;
}) {
  const [v, setV] = useState(value), [bad, setBad] = useState(false);
  const editing = useRef(false), live = useRef(value), sent = useRef(value);
  const mark = useDirty();
  useEffect(() => { sent.current = value; if (!editing.current && !bad) { live.current = value; setV(value); } }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = async () => {
    editing.current = false;
    const next = live.current.trim();
    if (required && !next) { onEmpty?.(); live.current = sent.current; setV(sent.current); setBad(false); mark(false); return; }
    if (next === sent.current) { if (next !== live.current) { live.current = next; setV(next); } setBad(false); mark(false); return; }
    sent.current = next;
    const ok = await onSave(next);
    if (ok) { setBad(false); if (live.current.trim() === next) mark(false); }
    else { sent.current = value; setBad(true); }
  };
  return (
    <span className={`cell${bad ? " bad" : ""}`}>
      <input className={`cell-in ${className}`} data-cell={cell} value={v} maxLength={max} placeholder={placeholder} aria-label={label} aria-invalid={bad || undefined} spellCheck={false}
        onFocus={() => { editing.current = true; }}
        onChange={ev => { live.current = ev.target.value; setV(ev.target.value); mark(ev.target.value.trim() !== sent.current); }}
        onBlur={commit}
        onKeyDown={ev => {
          if (ev.altKey) return;
          if (ev.key === "Escape") { live.current = sent.current; setV(sent.current); setBad(false); mark(false); editing.current = false; (ev.target as HTMLElement).blur(); return; }
          if (ev.key === "Enter" || ev.key === "ArrowUp" || ev.key === "ArrowDown") { ev.preventDefault(); nav(ev.key, ev.shiftKey); }
        }} />
      {bad && <span className="cell-err" role="alert">Not saved. Click away to retry.</span>}
    </span>
  );
}

function MoneyCell({ minor, onSave, label, cell, locked, nav }: { minor: number; onSave: (v: number) => Promise<boolean>; label: string; cell: string; locked: boolean; nav: (key: "Enter" | "ArrowUp" | "ArrowDown", shift: boolean) => void }) {
  const shown = (m: number) => m % 100 ? (m / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }) : (m / 100).toLocaleString("en-US");
  const [v, setV] = useState(shown(minor)), [bad, setBad] = useState<"" | "format" | "save">("");
  const editing = useRef(false), mark = useDirty();
  useEffect(() => { if (!editing.current) { setV(shown(minor)); setBad(""); } }, [minor]);
  const commit = async () => {
    editing.current = false;
    const parsed = parseDollars(v);
    if (!v.trim()) { setV(shown(minor)); mark(false); setBad(""); return; }
    if (!parsed) { setBad("format"); return; }
    setV(shown(parsed));
    if (parsed === minor) { mark(false); setBad(""); return; }
    const ok = await onSave(parsed);
    setBad(ok ? "" : "save"); if (ok) mark(false);
  };
  return (
    <span className={`cell money${bad ? " bad" : ""}${locked ? " locked" : ""}`} title={locked ? "Locked once someone bids" : undefined}>
      <b aria-hidden="true">$</b>
      <input className="cell-in" data-cell={cell} inputMode="decimal" value={v} disabled={locked} aria-label={label} aria-invalid={Boolean(bad) || undefined}
        onFocus={ev => { editing.current = true; if (!bad) { setV(dollarsInput(minor)); requestAnimationFrame(() => { if (document.activeElement === ev.target && editing.current) ev.target.select(); }); } }}
        onChange={ev => { setV(ev.target.value.replace(/[^0-9.,$]/g, "")); setBad(""); mark(true); }}
        onBlur={commit}
        onKeyDown={ev => {
          if (ev.altKey) return;
          if (ev.key === "Escape") { setV(dollarsInput(minor)); setBad(""); mark(false); (ev.target as HTMLElement).blur(); return; }
          if (ev.key === "Enter" || ev.key === "ArrowUp" || ev.key === "ArrowDown") { ev.preventDefault(); nav(ev.key, ev.shiftKey); }
        }} />
      {bad && <span className="cell-err" role="alert">{bad === "format" ? "Use an amount like 150" : "Not saved. Click away to retry."}</span>}
    </span>
  );
}

/** Click, drop or paste one photo onto a row. A newer pick, a removal or leaving the page cancels an unfinished upload. */
function PhotoCell({ ctx, item }: { ctx: SetupCtx; item: Item }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const upload = usePhotoUpload(item.imageAssetId ?? `none:${item.id}`, async (file, isCurrent) => {
    const before = ctx.current().items.find(i => i.id === item.id)?.imageAssetId ?? null;
    const asset = await uploadPhoto(file);
    if (!isCurrent()) return false;
    const latest = ctx.current().items.find(i => i.id === item.id);
    if (!latest || latest.imageAssetId !== before) return false;
    dispatchEvent(new CustomEvent("bz:photo-position-cancel", { detail: `item:${item.id}` }));
    return ctx.patchItem(latest, { imageAssetId: asset.id, imageFocal: CENTER, imageExpectedAssetId: before });
  }, `item:${item.id}`);
  return (
    <span className={`ph-cell${item.imageUrl ? " has" : ""}${over ? " over" : ""}${upload.busy ? " busy" : ""}${upload.error ? " bad" : ""}`}
      onDragOver={ev => { if (ev.dataTransfer.types.includes("Files")) { ev.preventDefault(); ev.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={ev => { const files = [...ev.dataTransfer.files]; if (files.length !== 1) return; ev.preventDefault(); ev.stopPropagation(); setOver(false); void upload.pick(files[0]); }}
      onPaste={ev => { const f = [...ev.clipboardData.files].find(x => x.type.startsWith("image/")); if (f) { ev.preventDefault(); void upload.pick(f); } }}>
      <button type="button" aria-label={item.imageUrl ? `Replace photo of ${item.title}` : `Add a photo of ${item.title}`} onClick={() => upload.error ? upload.retry() : input.current?.click()} title={upload.error || undefined}>
        {item.imageUrl ? <img src={item.imageUrl} alt="" style={photoStyle(item.imageFocal)} /> : <IPhoto size={18} />}
        {upload.busy && <span className="ph-spin" aria-label="Uploading" />}
        {upload.error && <span className="ph-retry">Retry</span>}
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={ev => { void upload.pick(ev.target.files?.[0]); ev.target.value = ""; }} />
    </span>
  );
}

// ---------------------------------------------------------------- adding
type Pending = { key: string; requestId: string; title: string; category: string; donor: string; openingMinor: number; error?: string };
type DraftRow = { title: string; category: string; donor: string; price: string };

/** The last row is always ready to type into. Enter adds the item and leaves the cursor in a fresh row, keeping the
 *  category for a run of similar items. Unfinished typing survives a reload on this device. */
function AddRow({ ctx, row, live, categories, counts, titleRef, nav, defaultCategory, onPasteRows, first, onAdded }: {
  ctx: SetupCtx; row: number; live: boolean; categories: string[]; counts: Map<string, number>; titleRef: React.RefObject<HTMLInputElement | null>;
  nav: (row: number, col: Col) => (key: "Enter" | "ArrowUp" | "ArrowDown", shift: boolean) => void; defaultCategory: string; onPasteRows: (text: string) => void; first: boolean;
  onAdded: (title: string) => void;
}) {
  const e = ctx.data.event, key = `bz_items_draft_${e.id}`;
  const [d, setD] = useState<DraftRow>({ title: "", category: defaultCategory, donor: "", price: "" });
  const [hint, setHint] = useState(""), [pending, setPending] = useState<Pending[]>([]);
  const priceRef = useRef<HTMLInputElement>(null), mark = useDirty();
  useEffect(() => { try { const s = localStorage.getItem(key); if (s) setD(JSON.parse(s)); } catch { /* ignore */ } }, [key]);
  useEffect(() => { setD(x => x.title || x.donor || x.price ? x : { ...x, category: defaultCategory }); }, [defaultCategory]);
  const put = (next: DraftRow) => {
    setD(next); setHint("");
    const typing = Boolean(next.title.trim() || next.donor.trim() || next.price.trim());
    mark(typing);
    try { if (typing) localStorage.setItem(key, JSON.stringify(next)); else localStorage.removeItem(key); } catch { /* ignore */ }
  };
  const send = useCallback(async (p: Pending) => {
    setPending(list => list.map(x => x.key === p.key ? { ...x, error: undefined } : x));
    let message = "";
    const ok = await ctx.track(async () => {
      const r = await api("POST", `/api/v1/host/events/${e.id}/items`, { requestId: p.requestId, title: p.title, openingMinor: p.openingMinor, category: p.category, donor: p.donor });
      if (!r.ok) message = errorText(r);
      return { ok: r.ok, message: r.ok ? undefined : message };
    });
    setPending(list => ok ? list.filter(x => x.key !== p.key) : list.map(x => x.key === p.key ? { ...x, error: message || "Not added. Try again." } : x));
    if (ok) onAdded(p.title);
  }, [ctx, e.id, onAdded]);
  const submit = () => {
    const title = d.title.trim(), price = parseDollars(d.price);
    if (!title) { if (d.price || d.donor) { setHint("Add a title"); titleRef.current?.focus(); } return; }
    if (!price) { setHint(d.price ? "Use an amount like 150" : "Add a starting bid to save this item"); priceRef.current?.focus(); return; }
    const p: Pending = { key: newId(), requestId: newId(), title, category: d.category.trim(), donor: d.donor.trim(), openingMinor: price };
    setPending(list => [...list, p]);
    put({ title: "", category: d.category, donor: "", price: "" });
    requestAnimationFrame(() => titleRef.current?.focus());
    void send(p);
  };
  const keys = (col: Col) => (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Enter") { ev.preventDefault(); submit(); return; }
    if (ev.key === "ArrowUp" && !ev.altKey) { ev.preventDefault(); nav(row, col)("ArrowUp", false); }
    if (ev.key === "Escape") put({ title: "", category: d.category, donor: "", price: "" });
  };
  return (
    <>
      {pending.map(p => (
        <div key={p.key} role="row" className={`iw-row iw-pending${p.error ? " failed" : ""}`}>
          <span role="cell" className="c-sel" /><span role="cell" className="c-grip" /><span role="cell" className="c-no">{p.error ? <IAlert size={16} /> : <span className="spin" aria-hidden="true" />}</span>
          <span role="cell" className="c-photo" />
          <span role="cell" className="c-title"><span className="pend-t">{p.title}</span>{p.error && <span className="cell-err static">{p.error}</span>}</span>
          <span role="cell" className="c-cat">{p.category || "—"}</span><span role="cell" className="c-donor">{p.donor || "—"}</span>
          <span role="cell" className="c-start">{formatMoney(p.openingMinor)}</span>
          <span role="cell" className="c-vis">{p.error ? <button type="button" className="sx-btn sm" onClick={() => void send(p)}>Retry</button> : <small>Adding…</small>}</span>
          <span role="cell" className="c-status" />
          <span role="cell" className="c-open">{p.error && <button type="button" className="sx-icon-btn sm" aria-label={`Discard ${p.title}`} onClick={() => setPending(list => list.filter(x => x.key !== p.key))}><IClose size={16} /></button>}</span>
        </div>
      ))}
      <div role="row" className={`iw-row iw-add${first ? " first" : ""}`}>
        <span role="cell" className="c-sel" /><span role="cell" className="c-grip" />
        <span role="cell" className="c-no"><IPlus size={16} /></span>
        <span role="cell" className="c-photo" />
        <span role="cell" className="c-title">
          <input ref={titleRef} className="cell-in" data-cell={`${row}:title`} value={d.title} maxLength={200} aria-label="New item title" placeholder={first ? "Type your first item’s title" : "Add an item: type a title"}
            onChange={ev => put({ ...d, title: ev.target.value })} onKeyDown={keys("title")}
            onPaste={ev => { const text = ev.clipboardData.getData("text/plain"); if (looksLikeRows(text)) { ev.preventDefault(); onPasteRows(text); } }} />
          <span className="add-note">{hint ? <b className="add-hint" role="alert">{hint}</b> : <small>{live ? "Enter adds it. New items start hidden; show each one when it’s ready." : "Enter adds it, then starts the next. Paste spreadsheet rows here too."}</small>}</span>
        </span>
        <span role="cell" className="c-cat">
          <CategoryInput value={d.category} categories={categories} counts={counts} label="New item category" placeholder="Category"
            inputProps={{ "data-cell": `${row}:category`, className: "cell-in" }} onSave={v => { put({ ...d, category: v }); return true; }} onNav={k => { if (k === "Enter") submit(); else nav(row, "category")(k, false); }} />
        </span>
        <span role="cell" className="c-donor"><input className="cell-in" data-cell={`${row}:donor`} value={d.donor} maxLength={200} aria-label="New item provided by" placeholder="Provided by" onChange={ev => put({ ...d, donor: ev.target.value })} onKeyDown={keys("donor")} /></span>
        <span role="cell" className="c-start"><span className="cell money"><b aria-hidden="true">$</b><input ref={priceRef} className="cell-in" data-cell={`${row}:start`} inputMode="decimal" value={d.price} aria-label="New item starting bid" placeholder="0"
          onChange={ev => put({ ...d, price: ev.target.value.replace(/[^0-9.,$]/g, "") })} onKeyDown={keys("start")} /></span></span>
        <span role="cell" className="c-vis"><button type="button" className="sx-btn primary sm add-go" onClick={submit} disabled={!d.title.trim()}>Add</button></span>
        <span role="cell" className="c-status" />
        <span role="cell" className="c-open" />
      </div>
    </>
  );
}

function EmptyHelp({ onPaste, onType }: { onPaste: () => void; onType: () => void }) {
  return (
    <div className="iw-start">
      <button type="button" onClick={onType}><span className="n">1</span><b>Type them in</b><small>Title, category, provider, starting bid. Enter adds the item and starts the next.</small></button>
      <button type="button" onClick={onPaste}><span className="n">2</span><b>Paste from a spreadsheet</b><small>Copy rows from Excel, Google Sheets or Numbers. You&rsquo;ll check them before anything is added.</small></button>
      <div><span className="n">3</span><b>Then drop in the photos</b><small>Drop a folder&rsquo;s worth at once. They match by item number or title in the file name.</small></div>
    </div>
  );
}

// ---------------------------------------------------------------- menus and the bulk bar
function Popover({ label, button, children, className = "", align = "left", disabled }: { label: string; button: ReactNode; children: (close: () => void) => ReactNode; className?: string; align?: "left" | "right" | "up"; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (ev: MouseEvent) => { if (!ref.current?.contains(ev.target as Node)) setOpen(false); };
    const esc = (ev: globalThis.KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className={`iw-pop-wrap ${className}`} ref={ref}>
      <button type="button" className="sx-btn" aria-haspopup="true" aria-expanded={open} aria-label={label} disabled={disabled} onClick={() => setOpen(!open)}>{button}</button>
      {open && <div className={`iw-pop ${align}`} role="menu">{children(() => setOpen(false))}</div>}
    </div>
  );
}

function ArrangeMenu({ onArrange, onCategories, disabled }: { onArrange: (how: "category" | "title" | "price") => void; onCategories: () => void; disabled: boolean }) {
  return (
    <Popover label="More item actions" button={<IMore size={18} />} align="right" className="iw-more">
      {close => <>
        <p className="pop-h">Arrange the list</p>
        <button type="button" role="menuitem" disabled={disabled} onClick={() => { close(); onArrange("category"); }}>Group by category<small>Keeps each category together, in your category order</small></button>
        <button type="button" role="menuitem" disabled={disabled} onClick={() => { close(); onArrange("title"); }}>Title, A to Z</button>
        <button type="button" role="menuitem" disabled={disabled} onClick={() => { close(); onArrange("price"); }}>Starting bid, lowest first</button>
        <hr />
        <button type="button" role="menuitem" onClick={() => { close(); onCategories(); }}>Manage categories…</button>
      </>}
    </Popover>
  );
}

function BulkBar({ count, total, live, categories, counts, withBids, onAll, onClear, onCategory, onShow, canShow, onHide, canHide, onDelete }: {
  count: number; total: number; live: boolean; categories: string[]; counts: Map<string, number>; withBids: number;
  onAll: () => void; onClear: () => void; onCategory: (name: string) => void; onShow: () => void; canShow: boolean; onHide: () => void; canHide: boolean; onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false), [fresh, setFresh] = useState("");
  const deletable = count - withBids;
  useEffect(() => setConfirming(false), [count]);
  return (
    <div className="iw-bulk" role="toolbar" aria-label={`${count} selected`}>
      {confirming ? (
        <>
          <span className="bk-q"><b>Delete {plural(deletable, "item")}?</b>{withBids > 0 && <small>{plural(withBids, "item")} with bids will be kept. Withdraw {withBids === 1 ? "it" : "them"} in Live instead.</small>}</span>
          <button type="button" className="sx-btn danger sm" disabled={!deletable} onClick={() => { setConfirming(false); onDelete(); }}>Delete {deletable}</button>
          <button type="button" className="sx-btn on-dark sm" onClick={() => setConfirming(false)}>Cancel</button>
        </>
      ) : (
        <>
          <span className="bk-n"><b>{count}</b> selected{count < total && <button type="button" className="link" onClick={onAll}>Select all {total}</button>}</span>
          <Popover label="Set category" button={<>Category</>} align="up" className="bk-cat">
            {close => <div className="bk-cat-pop">
              <form onSubmit={ev => { ev.preventDefault(); if (fresh.trim()) { close(); onCategory(fresh.trim()); setFresh(""); } }}>
                <input value={fresh} onChange={ev => setFresh(ev.target.value)} placeholder="New category" aria-label="New category name" maxLength={100} autoFocus />
                <button type="submit" className="sx-btn primary sm" disabled={!fresh.trim()}>Set</button>
              </form>
              <div className="bk-cat-list">
                {categories.filter(c => !fresh.trim() || c.toLowerCase().includes(fresh.trim().toLowerCase())).map(c => <button type="button" role="menuitem" key={c} onClick={() => { close(); onCategory(c); }}>{c}<small>{counts.get(c) ?? 0}</small></button>)}
                <button type="button" role="menuitem" className="muted" onClick={() => { close(); onCategory(""); }}>No category</button>
              </div>
            </div>}
          </Popover>
          <button type="button" className="sx-btn on-dark sm" disabled={!canShow} onClick={onShow}><IEye size={16} />Show{live ? " to guests" : ""}</button>
          <button type="button" className="sx-btn on-dark sm" disabled={!canHide} onClick={onHide}><IEyeOff size={16} />Hide</button>
          <button type="button" className="sx-btn on-dark sm danger-t" onClick={() => setConfirming(true)}><ITrash size={16} />Delete</button>
          <button type="button" className="sx-icon-btn sm bk-x" aria-label="Clear selection" onClick={onClear}><IClose size={18} /></button>
        </>
      )}
    </div>
  );
}

