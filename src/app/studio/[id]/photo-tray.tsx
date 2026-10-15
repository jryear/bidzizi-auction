"use client";
// The photo tray: uploading is separate from assigning. Photos added (button, drop anywhere on the Items workspace, paste)
// upload straight away, a few at a time, into a tray above the table. Nothing changes an item until a photo is placed:
// dragged onto a row (or a card on the phone preview), tapped then a row, or chosen with "Assign to…". File names that name
// an item are offered as suggestions to accept in one go. The tray belongs to the event for this browser session, so
// leaving the Items view (or reloading) never silently loses an uploaded photo.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { byFileName, matchPhotos } from "../../../lib/photo-match";
import { IAlert, ICheck, IClose, IPhoto, IPlus } from "../../../lib/icons";
import { isHeic, shrink, unreadable, type Item } from "../data";

export type TrayPhoto = {
  key: string; name: string; state: "waiting" | "uploading" | "ready" | "failed"; progress: number; processing?: boolean;
  thumb: string | null; assetId?: string; assetUrl?: string; error?: string; file?: File;
};
const CONCURRENCY = 3;

class Tray {
  photos: TrayPhoto[] = [];
  private listeners = new Set<() => void>();
  private running = 0;
  constructor(private eventId: string) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(this.storeKey) ?? "[]") as TrayPhoto[];
      this.photos = saved.filter(p => p.assetId).map(p => ({ ...p, state: "ready", progress: 1, thumb: p.assetUrl ?? null }));
    } catch { /* storage unavailable: the tray starts empty */ }
  }
  private get storeKey() { return `bz_tray_${this.eventId}`; }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  snapshot = () => this.photos;
  private emit() {
    this.photos = [...this.photos];
    try { sessionStorage.setItem(this.storeKey, JSON.stringify(this.photos.filter(p => p.state === "ready").map(({ key, name, assetId, assetUrl }) => ({ key, name, assetId, assetUrl })))); } catch { /* ignore */ }
    for (const fn of this.listeners) fn();
  }
  private patch(key: string, change: Partial<TrayPhoto>) { this.photos = this.photos.map(p => p.key === key ? { ...p, ...change } : p); this.emit(); }

  add(files: File[]) {
    const fresh = [...files].sort((a, b) => byFileName(a.name, b.name)).map((file): TrayPhoto => ({
      key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, state: "waiting", progress: 0,
      thumb: isHeic(file) ? null : URL.createObjectURL(file), file,
    }));
    this.photos = [...this.photos, ...fresh]; this.emit(); this.pump();
    return fresh.length;
  }
  retry(key: string) { this.patch(key, { state: "waiting", error: undefined, progress: 0 }); this.pump(); }
  remove(key: string) { const p = this.photos.find(x => x.key === key); if (p?.thumb?.startsWith("blob:")) URL.revokeObjectURL(p.thumb); this.photos = this.photos.filter(x => x.key !== key); this.emit(); }
  /** Take photos out of the tray while they're being placed. */
  take(keys: string[]) { const out = this.photos.filter(p => keys.includes(p.key)); this.photos = this.photos.filter(p => !keys.includes(p.key)); this.emit(); return out; }
  /** Put photos back (a failed or undone placement), with an optional note. */
  restore(photos: TrayPhoto[], note?: string) {
    const back = photos.filter(p => !this.photos.some(x => x.key === p.key)).map(p => ({ ...p, error: note }));
    this.photos = [...back, ...this.photos]; this.emit();
  }
  note(key: string, error?: string) { this.patch(key, { error }); }

  private pump() {
    while (this.running < CONCURRENCY) {
      const next = this.photos.find(p => p.state === "waiting");
      if (!next) return;
      this.running++;
      this.patch(next.key, { state: "uploading", progress: 0 });
      void this.upload(next).finally(() => { this.running--; this.pump(); });
    }
  }
  private async upload(photo: TrayPhoto) {
    const file = photo.file;
    if (!file) { this.patch(photo.key, { state: "failed", error: "Add this photo again." }); return; }
    if (!file.type.startsWith("image/") && !isHeic(file)) { this.patch(photo.key, { state: "failed", error: "This file isn’t an image. Use a JPEG, PNG or WebP." }); return; }
    let out: { blob: Blob; type: string };
    try { out = await shrink(file, "photo"); }
    catch { this.patch(photo.key, { state: "failed", error: unreadable(file) }); return; }
    // The server decodes one image at a time; when it's busy, wait a moment and try again.
    for (let attempt = 0, lost = 0; ; attempt++) {
      const r = await send(out.blob, out.type, (sent, processing) => this.patch(photo.key, { progress: sent, processing }));
      if (!this.photos.some(p => p.key === photo.key)) return; // removed meanwhile
      if (r.status === 0 && lost++ < 2) { await wait(800); continue; }
      if (r.status === 0) { this.patch(photo.key, { state: "failed", error: "Connection lost. The photo wasn’t uploaded." }); return; }
      if (r.status === 503 && r.data?.error?.code === "ASSET_BUSY" && attempt < 40) { this.patch(photo.key, { progress: 1, processing: true }); await wait(Math.min(1600, 200 + attempt * 120) + Math.random() * 300); continue; }
      if (r.status >= 300 || !r.data?.id) { this.patch(photo.key, { state: "failed", error: r.data?.error?.message ?? "Upload failed. Try again." }); return; }
      this.patch(photo.key, { state: "ready", progress: 1, processing: false, assetId: r.data.id, assetUrl: r.data.url, error: undefined });
      return;
    }
  }
}
const wait = (ms: number) => new Promise(done => setTimeout(done, ms));
type Reply = { status: number; data: { id?: string; url?: string; error?: { code?: string; message?: string } } | null };
function send(blob: Blob, type: string, progress: (fraction: number, processing: boolean) => void): Promise<Reply> {
  return new Promise(resolve => {
    const x = new XMLHttpRequest();
    x.open("POST", "/api/v1/host/assets"); x.setRequestHeader("Content-Type", type); x.withCredentials = true;
    x.upload.onprogress = e => { if (e.lengthComputable) progress(e.loaded / e.total, e.loaded >= e.total); };
    x.upload.onload = () => progress(1, true);
    x.onload = () => { let data = null; try { data = JSON.parse(x.responseText); } catch { /* not JSON */ } resolve({ status: x.status, data }); };
    x.onerror = () => resolve({ status: 0, data: null });
    x.send(blob);
  });
}

const trays = new Map<string, Tray>();
export function trayFor(eventId: string) { let t = trays.get(eventId); if (!t) { t = new Tray(eventId); trays.set(eventId, t); } return t; }
const EMPTY: TrayPhoto[] = [];
export function useTray(eventId: string) {
  const tray = trayFor(eventId);
  const photos = useSyncExternalStore(tray.subscribe, tray.snapshot, () => EMPTY);
  return { tray, photos };
}

/** Suggested items for ready photos, by file name, among items that still need a photo. */
export function suggestions(photos: TrayPhoto[], items: Item[]): Map<string, string> {
  const ready = photos.filter(p => p.state === "ready");
  const open = items.filter(i => !i.imageUrl);
  const ids = matchPhotos(ready.map(p => p.name), open.map(i => ({ id: i.id, title: i.title, position: i.position, hasPhoto: false })), "name");
  return new Map(ready.flatMap((p, n) => ids[n] ? [[p.key, ids[n]!] as [string, string]] : []));
}

const lot = (i: Pick<Item, "position">) => String(i.position + 1).padStart(2, "0");
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Elements a photo can be dropped on: Items rows and the phone preview's cards. */
function targetAt(x: number, y: number): { el: HTMLElement; id: string } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-item-row], [data-item-id]");
  const id = el?.dataset.itemRow ?? el?.dataset.itemId;
  return el && id ? { el, id } : null;
}

export function PhotoTray({ eventId, items, inputRef, picked, setPicked, onPlace, onAccept, onInOrder, ask, onConfirm, onCancelAsk }: {
  eventId: string; items: Item[]; inputRef: React.RefObject<HTMLInputElement | null>;
  picked: string | null; setPicked: (key: string | null) => void;
  onPlace: (key: string, itemId: string) => void; onAccept: (pairs: { key: string; itemId: string }[]) => void; onInOrder: () => void;
  ask: { title: string; count: number } | null; onConfirm: () => void; onCancelAsk: () => void;
}) {
  const { tray, photos } = useTray(eventId);
  const suggested = suggestions(photos, items);
  const [drag, setDrag] = useState<{ key: string; x: number; y: number; thumb: string | null } | null>(null);
  const start = useRef<{ key: string; x: number; y: number; id: number; moved: boolean } | null>(null), over = useRef<HTMLElement | null>(null);
  const counts = { uploading: photos.filter(p => p.state === "uploading" || p.state === "waiting").length, ready: photos.filter(p => p.state === "ready").length, failed: photos.filter(p => p.state === "failed").length };
  const total = photos.length;
  const overall = total ? photos.reduce((s, p) => s + (p.state === "ready" ? 1 : p.state === "uploading" ? p.progress * 0.9 : 0), 0) / Math.max(1, total - counts.failed) : 0;
  const noPhoto = items.filter(i => !i.imageUrl).length;
  const pickedPhoto = photos.find(p => p.key === picked);
  useEffect(() => { if (picked && !photos.some(p => p.key === picked && p.state === "ready")) setPicked(null); }, [photos, picked, setPicked]);

  const hover = (el: HTMLElement | null) => {
    if (over.current === el) return;
    over.current?.classList.remove("drop-over"); el?.classList.add("drop-over"); over.current = el;
  };
  // Dragging near the top or bottom of the window scrolls the list, so any row can be reached.
  const pointer = useRef<{ x: number; y: number } | null>(null), scroller = useRef(0);
  const autoscroll = () => {
    const p = pointer.current;
    if (!p) { scroller.current = 0; return; }
    const edge = 90, speed = p.y < edge ? -(edge - p.y) / 3 : p.y > innerHeight - edge ? (p.y - (innerHeight - edge)) / 3 : 0;
    if (speed) { scrollBy(0, speed); hover(targetAt(p.x, p.y)?.el ?? null); }
    scroller.current = requestAnimationFrame(autoscroll);
  };
  const end = () => { hover(null); setDrag(null); start.current = null; pointer.current = null; cancelAnimationFrame(scroller.current); scroller.current = 0; document.documentElement.classList.remove("tray-dragging"); };
  useEffect(() => () => cancelAnimationFrame(scroller.current), []);

  return (
    <section className={`tray${total ? "" : " empty"}${drag ? " tray-lifting" : ""}`} data-photo-tray aria-label="Photo tray">
      <input ref={inputRef} data-tray-input type="file" accept="image/*,.heic,.heif" multiple hidden onChange={e => { tray.add([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {total > 0 && <>
        <header className="tray-head">
          <div className="tray-sum">
            <b>Photos</b>
            <span>{[counts.uploading && `${counts.uploading} uploading`, counts.ready && `${counts.ready} ready to place`, counts.failed && `${counts.failed} need attention`].filter(Boolean).join(" · ")}</span>
            {counts.uploading > 0 && <span className="tray-bar" aria-hidden="true"><i style={{ width: `${Math.round(overall * 100)}%` }} /></span>}
          </div>
          <div className="tray-acts">
            {suggested.size > 0 && <button type="button" className="sx-btn sm primary" onClick={() => onAccept([...suggested].map(([key, itemId]) => ({ key, itemId })))}><ICheck size={15} />Place {plural(suggested.size, "match", "matches")}</button>}
            {counts.ready > 0 && noPhoto > 0 && <button type="button" className="sx-btn sm" onClick={onInOrder} title="First photo to the first item without one, and so on">Fill in order</button>}
            <button type="button" className="sx-btn sm ghost" onClick={() => inputRef.current?.click()}><IPlus size={15} />Add</button>
          </div>
        </header>
        {ask ? (
          <div className="tray-ask" role="alertdialog" aria-label="Replace photo">
            <span>Replace the photo on <b>{ask.title}</b>{ask.count > 1 ? ` and ${plural(ask.count - 1, "other item")}` : ""}? You can undo it.</span>
            <button type="button" className="sx-btn sm primary" onClick={onConfirm}>Replace</button>
            <button type="button" className="sx-btn sm ghost" onClick={onCancelAsk}>Cancel</button>
          </div>
        ) : pickedPhoto ? (
          <div className="tray-pick" role="status">
            <span>Tap an item to place <b>{pickedPhoto.name}</b></span>
            <select aria-label="Assign to…" value="" onChange={e => { if (e.target.value) onPlace(pickedPhoto.key, e.target.value); }}>
              <option value="">Assign to…</option>
              {items.map(i => <option key={i.id} value={i.id}>{lot(i)} · {i.title}{i.imageUrl ? " (has a photo)" : ""}</option>)}
            </select>
            <button type="button" className="sx-btn sm ghost" onClick={() => setPicked(null)}>Cancel</button>
          </div>
        ) : counts.ready > 0 && <p className="tray-tip">Drag a photo onto an item. Or tap a photo, then the item.</p>}
        <ul className="tray-grid">
          {photos.map(p => {
            const target = items.find(i => i.id === suggested.get(p.key));
            const status = p.state === "failed" ? p.error ?? "Upload failed." : p.state === "waiting" ? "Waiting…" : p.state === "uploading" ? (p.processing ? "Processing…" : `Uploading ${Math.round(p.progress * 100)}%`) : target ? `Suggested: ${lot(target)} ${target.title}` : p.error ?? "Ready to place";
            return (
              <li key={p.key} data-tray-photo data-state={p.state === "waiting" ? "uploading" : p.state} className={`tt s-${p.state}${picked === p.key ? " picked" : ""}${drag?.key === p.key ? " lifted" : ""}${target ? " suggested" : ""}`}>
                <button type="button" className="tt-hit" disabled={p.state !== "ready"} aria-pressed={picked === p.key} aria-label={`${p.name}. ${status}`}
                  onDragStart={e => e.preventDefault()}
                  onPointerDown={e => {
                    if (p.state !== "ready" || e.button !== 0) return;
                    start.current = { key: p.key, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
                    if (e.pointerType === "mouse") e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={e => {
                    const s = start.current;
                    if (!s || s.id !== e.pointerId || e.pointerType !== "mouse") return;
                    if (!s.moved && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return;
                    s.moved = true; document.documentElement.classList.add("tray-dragging");
                    setDrag({ key: p.key, x: e.clientX, y: e.clientY, thumb: p.thumb });
                    pointer.current = { x: e.clientX, y: e.clientY };
                    if (!scroller.current) scroller.current = requestAnimationFrame(autoscroll);
                    hover(targetAt(e.clientX, e.clientY)?.el ?? null);
                  }}
                  onPointerUp={e => {
                    const s = start.current;
                    if (!s || s.id !== e.pointerId) return;
                    if (s.moved) { const t = targetAt(e.clientX, e.clientY); end(); if (t) onPlace(p.key, t.id); }
                    else { start.current = null; setPicked(picked === p.key ? null : p.key); }
                  }}
                  onPointerCancel={end}
                  onKeyDown={e => { if (e.key === "Escape") setPicked(null); }}>
                  {p.thumb ? <img src={p.thumb} alt="" draggable={false} /> : <span className="tt-ph"><IPhoto size={22} /><small>{p.name.split(".").pop()?.toUpperCase()}</small></span>}
                  {(p.state === "uploading" || p.state === "waiting") && <span className="tt-bar"><i style={{ width: `${Math.round((p.state === "waiting" ? 0 : p.progress) * 100)}%` }} /></span>}
                  {p.state === "failed" && <span className="tt-bad"><IAlert size={16} /></span>}
                  {target && <span className="tt-no">→ {lot(target)}</span>}
                </button>
                <span className="tt-name" title={p.name}>{p.name}</span>
                <small className="tt-note">{status}</small>
                <span className="tt-x">
                  {p.state === "failed" && p.file && !isHeic(p.file) && <button type="button" className="tt-retry" onClick={() => tray.retry(p.key)}>Retry</button>}
                  <button type="button" className="tt-del" aria-label={`Remove ${p.name} from the tray`} onClick={() => tray.remove(p.key)}><IClose size={14} /></button>
                </span>
              </li>
            );
          })}
        </ul>
      </>}
      {drag && <span className="tray-ghost" aria-hidden="true" style={{ left: drag.x, top: drag.y }}>{drag.thumb ? <img src={drag.thumb} alt="" /> : <IPhoto size={20} />}</span>}
    </section>
  );
}
