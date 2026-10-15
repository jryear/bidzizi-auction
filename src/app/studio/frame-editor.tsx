"use client";
// Framing a photo in place, on the Studio's phone: the photo itself moves under the pointer or finger, zoom is immediate
// (pinch, trackpad pinch, wheel, the slider, double-click, + and -), and the part of the photo outside the frame stays
// visible but dimmed. Small strips show the same frame on the other shapes it appears in. The editor is drawn over the
// real guest component, which renders the same frame underneath. Its own drafts are local while a gesture runs; the
// Studio hears about changes when a gesture settles, and saves them like every other edit.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { FramedPhoto } from "../../lib/framed-photo";
import { DEFAULT_FRAME, MAX_ZOOM, MIN_ZOOM, clampFrame, frameLayout, sameFrame, type Frame } from "../../lib/photo";
import { ICheck, IMinus, IPlus, IReset } from "../../lib/icons";

type Rect = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };
export type FrameShape = { label: string; ratio: number };
export const ITEM_SHAPES: FrameShape[] = [{ label: "Card", ratio: 4 / 3 }, { label: "Square", ratio: 1 }, { label: "Stage", ratio: 4 / 5 }, { label: "Wide", ratio: 16 / 9 }];
export const COVER_SHAPES: FrameShape[] = [{ label: "Wide", ratio: 16 / 9 }, { label: "Banner", ratio: 16 / 7 }, { label: "Square", ratio: 1 }];

export function FrameEditor({ box, url, frame: initial, shapes, onChange, onDone, onCancel }: {
  box: { current: HTMLElement | null }; url: string; frame: Frame; shapes: FrameShape[];
  onChange: (f: Frame) => void; onDone: (f: Frame) => void; onCancel: () => void;
}) {
  const [device, setDevice] = useState<HTMLElement | null>(null);
  const [area, setArea] = useState<(Rect & { r: string }) | null>(null);
  const [rect, setRect] = useState<Rect | null>(null), [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState(initial), [active, setActive] = useState(false), [panelTop, setPanelTop] = useState(false);
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const placed = area !== null;
  const live = useRef({ frame, rect, size, area }); live.current = { frame, rect, size, area };
  const pointers = useRef(new Map<number, Pt>()), gesture = useRef<{ frame: Frame; pts: Pt[] } | null>(null);
  const report = useRef<ReturnType<typeof setTimeout>>(undefined), reported = useRef(initial);
  const cb = useRef({ onChange, onDone, onCancel }); cb.current = { onChange, onDone, onCancel };

  // Find the phone and the photo's natural size; bring the photo into view.
  // The box can still be detached during this layout pass (a parent attaching its ref after its children); look again
  // on the next frame rather than never opening.
  const [retry, setRetry] = useState(0);
  useLayoutEffect(() => {
    const b = box.current, d = b?.closest<HTMLElement>("[data-preview-device]");
    if (!b || !d) {
      if (retry > 30) return;
      const raf = requestAnimationFrame(() => setRetry(n => n + 1));
      return () => cancelAnimationFrame(raf);
    }
    setDevice(d);
    const r = b.getBoundingClientRect(), s = d.getBoundingClientRect();
    if (r.top < s.top + 40 || r.bottom > s.bottom - 160) b.scrollIntoView({ block: r.height > s.height - 200 ? "start" : "center" });
    const img = b.querySelector("img");
    const take = () => { if (img?.naturalWidth) setSize({ w: img.naturalWidth, h: img.naturalHeight }); };
    take(); img?.addEventListener("load", take);
    return () => img?.removeEventListener("load", take);
  }, [box, retry]);
  // Follow the photo's box (layout shifts, resizes, scrolling) for as long as the editor is open.
  useEffect(() => {
    if (!device) return;
    let raf = 0;
    const tick = () => {
      const b = box.current, screen = device.querySelector<HTMLElement>(".device-screen") ?? device;
      if (b) {
        // The editor covers the phone's screen (not its bezel); everything is measured from that screen.
        const sc = screen.getBoundingClientRect(), dv = device.getBoundingClientRect();
        const a = { x: sc.left - dv.left - device.clientLeft, y: sc.top - dv.top - device.clientTop, w: sc.width, h: sc.height, r: getComputedStyle(screen).borderRadius };
        const ca = live.current.area;
        if (!ca || ca.x !== a.x || ca.y !== a.y || ca.w !== a.w || ca.h !== a.h || ca.r !== a.r) setArea(a);
        const r = b.getBoundingClientRect();
        const next = { x: r.left - sc.left, y: r.top - sc.top, w: r.width, h: r.height };
        const cur = live.current.rect;
        if (!cur || Math.abs(cur.x - next.x) + Math.abs(cur.y - next.y) + Math.abs(cur.w - next.w) + Math.abs(cur.h - next.h) > 0.5) setRect(next);
        const ph = panel.current?.offsetHeight ?? 160, dh = sc.height;
        setPanelTop(next.y + next.h > dh - ph - 12 && next.y > ph + 12);
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [device, box]);
  // Focus once the editor is placed (it isn't mounted before the phone screen is measured).
  useEffect(() => { if (placed) root.current?.focus({ preventScroll: true }); }, [placed]);

  /** Scale the photo by `scale` about `from`, then move that point to `to` (device pixels). Clamped to the frame. */
  const transform = (start: Frame, scale: number, from: Pt, to: Pt): Frame => {
    const { rect: r, size: s } = live.current;
    if (!r || !s) return start;
    const base = clampFrame(r.w, r.h, s.w, s.h, start), L = frameLayout(r.w, r.h, s.w, s.h, base);
    const u = (from.x - r.x - L.left) / L.width, v = (from.y - r.y - L.top) / L.height;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base.zoom * scale)), k = zoom / base.zoom;
    const w = L.width * k, h = L.height * k, left = to.x - r.x - u * w, top = to.y - r.y - v * h;
    return clampFrame(r.w, r.h, s.w, s.h, { x: (r.w / 2 - left) / w, y: (r.h / 2 - top) / h, zoom });
  };
  const centre = (): Pt => { const r = live.current.rect; return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: 0, y: 0 }; };
  /** Show a frame now; tell the Studio once things settle (immediately when `settled`). */
  const set = (f: Frame, settled = false) => {
    setFrame(f); live.current.frame = f;
    clearTimeout(report.current);
    const send = () => { if (!sameFrame(f, reported.current)) { reported.current = f; cb.current.onChange(f); } };
    if (settled) send(); else report.current = setTimeout(send, 160);
  };
  useEffect(() => () => clearTimeout(report.current), []);
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const d = root.current!.getBoundingClientRect();
    return { x: e.clientX - d.left, y: e.clientY - d.top };
  };
  const restart = () => { gesture.current = { frame: live.current.frame, pts: [...pointers.current.values()] }; };

  // Wheel and Safari's trackpad gestures need non-passive listeners to keep the page from zooming or scrolling.
  useEffect(() => {
    const el = root.current;
    if (!el || !device) return;
    const onWheel = (e: WheelEvent) => {
      if (panel.current?.contains(e.target as Node)) return;
      e.preventDefault();
      const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
      const p = local(e);
      set(transform(live.current.frame, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)), p, p));
    };
    let g: { frame: Frame; p: Pt } | null = null;
    const onGestureStart = (e: Event) => { e.preventDefault(); g = { frame: live.current.frame, p: local(e as unknown as MouseEvent) }; };
    const onGestureChange = (e: Event) => { e.preventDefault(); if (g) set(transform(g.frame, (e as unknown as { scale: number }).scale, g.p, g.p)); };
    const onGestureEnd = (e: Event) => { e.preventDefault(); g = null; set(live.current.frame, true); };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("gesturestart", onGestureStart); el.addEventListener("gesturechange", onGestureChange); el.addEventListener("gestureend", onGestureEnd);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart); el.removeEventListener("gesturechange", onGestureChange); el.removeEventListener("gestureend", onGestureEnd);
    };
  }, [device, placed]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nothing is mounted until the editor is placed over the phone: whatever can see it can use it.
  if (!device || !placed) return null;
  const L = rect && size ? frameLayout(rect.w, rect.h, size.w, size.h, frame) : null;
  const zoomBy = (k: number) => { const c = centre(); set(transform(live.current.frame, k, c, c), true); };
  const finish = () => { clearTimeout(report.current); const f = live.current.frame; reported.current = f; cb.current.onDone(f); };

  return createPortal(
    <div ref={root} data-edit-chrome data-frame-editor className={`fe${active ? " is-active" : ""}`} tabIndex={-1} role="group"
      style={area ? { left: area.x, top: area.y, width: area.w, height: area.h, borderRadius: area.r } : { visibility: "hidden" }}
      aria-label="Frame the photo. Drag to move it, pinch or scroll to zoom. Arrow keys move, plus and minus zoom."
      onPointerDown={e => {
        if (panel.current?.contains(e.target as Node) || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault(); root.current?.focus({ preventScroll: true });
        e.currentTarget.setPointerCapture(e.pointerId);
        pointers.current.set(e.pointerId, local(e)); restart(); setActive(true);
      }}
      onPointerMove={e => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, local(e));
        const g = gesture.current, now = [...pointers.current.values()];
        if (!g || !g.pts.length) return;
        if (now.length === 1) set(transform(g.frame, 1, g.pts[0], now[0]));
        else if (now.length >= 2 && g.pts.length >= 2) {
          const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
          set(transform(g.frame, dist(now[0], now[1]) / dist(g.pts[0], g.pts[1]), mid(g.pts[0], g.pts[1]), mid(now[0], now[1])));
        }
      }}
      onPointerUp={e => { if (!pointers.current.delete(e.pointerId)) return; restart(); if (!pointers.current.size) { setActive(false); set(live.current.frame, true); } }}
      onPointerCancel={e => { pointers.current.delete(e.pointerId); restart(); if (!pointers.current.size) { setActive(false); set(live.current.frame, true); } }}
      onDoubleClick={e => { if (panel.current?.contains(e.target as Node)) return; const p = local(e); const z = live.current.frame.zoom > 1.05 ? 1 : 2; set(transform(live.current.frame, z / live.current.frame.zoom, p, p), true); }}
      onKeyDown={e => {
        const t = e.target as HTMLElement;
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); clearTimeout(report.current); cb.current.onCancel(); return; }
        if (t.tagName === "INPUT" || t.tagName === "BUTTON") return;
        const step = e.shiftKey ? 40 : 10, c = centre();
        const move: Record<string, Pt> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
        if (move[e.key]) { e.preventDefault(); set(transform(live.current.frame, 1, c, { x: c.x + move[e.key].x, y: c.y + move[e.key].y })); }
        else if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomBy(1.15); }
        else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomBy(1 / 1.15); }
        else if (e.key === "Enter") { e.preventDefault(); finish(); }
      }}>
      {rect && L && <img className="fe-photo" src={url} alt="" draggable={false} style={{ left: rect.x + L.left, top: rect.y + L.top, width: L.width, height: L.height }} />}
      {rect && <div className="fe-window" data-frame-window style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}><i className="fe-grid" aria-hidden="true" /></div>}
      <div ref={panel} className={`fe-panel${panelTop ? " top" : ""}`} onPointerDown={e => e.stopPropagation()}>
        <div className="fe-strips" aria-hidden="true">
          {shapes.map(s => <figure key={s.label}><FramedPhoto src={url} frame={frame} className="fe-strip" style={{ aspectRatio: String(s.ratio) } as CSSProperties} /><figcaption>{s.label}</figcaption></figure>)}
        </div>
        <div className="fe-zoom">
          <button type="button" className="fe-ic" aria-label="Zoom out" disabled={frame.zoom <= MIN_ZOOM + 1e-3} onClick={() => zoomBy(1 / 1.25)}><IMinus size={16} /></button>
          <input type="range" aria-label="Zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={0.05} value={frame.zoom} aria-valuetext={`${frame.zoom.toFixed(1)}×`}
            onChange={e => { const z = Number(e.target.value), c = centre(); set(transform(live.current.frame, z / live.current.frame.zoom, c, c)); }}
            onPointerUp={() => set(live.current.frame, true)} onKeyUp={() => set(live.current.frame, true)} />
          <button type="button" className="fe-ic" aria-label="Zoom in" disabled={frame.zoom >= MAX_ZOOM - 1e-3} onClick={() => zoomBy(1.25)}><IPlus size={16} /></button>
          <output className="fe-z">{frame.zoom.toFixed(1)}×</output>
        </div>
        <div className="fe-acts">
          <button type="button" className="fe-btn ghost" disabled={sameFrame(frame, DEFAULT_FRAME)} onClick={() => set(DEFAULT_FRAME, true)}><IReset size={16} />Reset</button>
          <span className="fe-hint">Drag to move · pinch or scroll to zoom</span>
          <button type="button" className="fe-btn primary" onClick={finish}><ICheck size={16} />Done</button>
        </div>
      </div>
    </div>,
    device);
}
