"use client";
import { useEffect, useId, useRef, useState } from "react";
import { CENTER, photoStyle, type FocalPoint } from "../../lib/photo";

/** Choose the important part once; every responsive photo slot uses the same point. */
export function AdjustPhoto({ url, focal, onSave, photoKey }: { photoKey: string; url: string; focal?: FocalPoint; onSave: (point: FocalPoint) => Promise<boolean> }) {
  const [open, setOpen] = useState(false), [point, setPoint] = useState(focal ?? CENTER), [ratio, setRatio] = useState(1.5);
  const [error, setError] = useState(false);
  const field = useId(), draft = useRef(point), dirty = useRef(false), generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined), save = useRef(onSave), sent = useRef<number | null>(null);
  save.current = onSave;
  const mark = (value: boolean) => { dirty.current = value; dispatchEvent(new CustomEvent("bz:editing", { detail: { field, dirty: value } })); };
  const flush = async () => {
    clearTimeout(timer.current);
    if (!dirty.current || sent.current === generation.current) return;
    const ticket = generation.current, next = draft.current;
    sent.current = ticket;
    const ok = await save.current(next);
    if (sent.current === ticket) sent.current = null;
    if (generation.current !== ticket) return;
    setError(!ok);
    if (ok) mark(false);
  };
  const change = (next: FocalPoint) => {
    draft.current = next; generation.current++; setPoint(next); mark(true); setError(false);
    clearTimeout(timer.current); timer.current = setTimeout(flush, 400);
  };
  useEffect(() => { if (!dirty.current) { draft.current = focal ?? CENTER; setPoint(draft.current); } }, [focal?.x, focal?.y]);
  useEffect(() => () => {
    clearTimeout(timer.current);
    if (dirty.current && sent.current !== generation.current) void save.current(draft.current);
    dispatchEvent(new CustomEvent("bz:editing", { detail: { field, dirty: false } }));
  }, [field]);
  useEffect(() => {
    const cancel = (e: Event) => {
      if ((e as CustomEvent).detail !== photoKey) return;
      clearTimeout(timer.current); generation.current++; mark(false); setError(false);
    };
    addEventListener("bz:photo-position-cancel", cancel);
    return () => removeEventListener("bz:photo-position-cancel", cancel);
  }, [photoKey]);
  return <div className="adjust-photo">
    <button type="button" className="sx-btn ghost sm" aria-expanded={open} onClick={() => setOpen(!open)}>Adjust photo</button>
    {open && <div className="focal-editor">
      <p>Tap the important part. We’ll keep it in view as the photo fits each screen.</p>
      <button type="button" className="focal-source" aria-label="Choose photo focus" onKeyDown={e => {
          if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
          e.preventDefault(); const step = e.shiftKey ? 0.1 : 0.02;
          change({ x: Math.max(0, Math.min(1, draft.current.x + (e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0))), y: Math.max(0, Math.min(1, draft.current.y + (e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0))) });
        }} style={{ width: `min(100%, ${240 * ratio}px)`, aspectRatio: ratio }}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const b = e.currentTarget.getBoundingClientRect(); change({ x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) }); }}
        onPointerMove={e => { if (!e.currentTarget.hasPointerCapture(e.pointerId)) return; const b = e.currentTarget.getBoundingClientRect(); change({ x: Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)), y: Math.max(0, Math.min(1, (e.clientY - b.top) / b.height)) }); }}
        onPointerUp={flush}>
        <img src={url} alt="Full photo" draggable={false} onLoad={e => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />
        <span className="focal-dot" style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} aria-hidden="true" />
      </button>
      <div className="focal-previews"><figure><img src={url} alt="Wide photo preview" style={photoStyle(point)} /><figcaption>Wide</figcaption></figure><figure><img src={url} alt="Square photo preview" style={photoStyle(point)} /><figcaption>Square</figcaption></figure></div>
      <label className="focal-range">Horizontal<input aria-label="Photo focus horizontal" type="range" min="0" max="100" value={Math.round(point.x * 100)} onChange={e => change({ ...draft.current, x: Number(e.target.value) / 100 })} onBlur={flush} /></label>
      <label className="focal-range">Vertical<input aria-label="Photo focus vertical" type="range" min="0" max="100" value={Math.round(point.y * 100)} onChange={e => change({ ...draft.current, y: Number(e.target.value) / 100 })} onBlur={flush} /></label>
      <button type="button" className="sx-btn ghost sm" onClick={() => change(CENTER)}>Center photo</button>
      {error && <p className="sx-hint err" role="alert">The position wasn’t saved. <button type="button" onClick={flush}>Try again</button></p>}
    </div>}
  </div>;
}
