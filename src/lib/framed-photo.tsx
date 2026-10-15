"use client";
// One renderer for every framed photo: the <img> is sized and offset in percentages of its box (cover fit × zoom, the
// frame's point at the centre, clamped so the box is always filled). Percentages stay right while the box resizes at the
// same shape; a shared ResizeObserver redoes the layout when the shape changes. No container units or object-view-box,
// so it behaves the same on iOS 15/16 Safari. Until the photo has loaded it is a plain centred cover fit.
import { useCallback, useLayoutEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { DEFAULT_FRAME, frameLayout, type Frame } from "./photo";

let observer: ResizeObserver | null = null;
const jobs = new WeakMap<Element, () => void>();
function watch(el: Element, run: () => void) {
  jobs.set(el, run);
  if (typeof ResizeObserver === "undefined") return;
  observer ??= new ResizeObserver(entries => { for (const e of entries) jobs.get(e.target)?.(); });
  observer.observe(el);
}
function unwatch(el: Element) { observer?.unobserve(el); jobs.delete(el); }

/** Lay out `img` inside `box` for `frame`. Returns false until both have a size. */
export function placePhoto(box: HTMLElement, img: HTMLImageElement, frame: Frame): boolean {
  const w = box.clientWidth, h = box.clientHeight, nw = img.naturalWidth, nh = img.naturalHeight;
  if (!w || !h || !nw || !nh) return false;
  const l = frameLayout(w, h, nw, nh, frame), s = img.style;
  s.width = `${(l.width / w) * 100}%`; s.height = `${(l.height / h) * 100}%`;
  s.left = `${(l.left / w) * 100}%`; s.top = `${(l.top / h) * 100}%`;
  return true;
}

// Constant, so React never resets what placePhoto writes; with the element at the photo's own shape, cover is a no-op.
const IMG: CSSProperties = { position: "absolute", left: 0, top: 0, width: "100%", height: "100%", maxWidth: "none", maxHeight: "none", objectFit: "cover" };

type Props = {
  src: string; frame?: Frame | null; alt?: string; as?: "span" | "div"; loading?: "lazy" | "eager"; children?: ReactNode;
  imgClassName?: string; boxRef?: { current: HTMLElement | null };
} & Omit<HTMLAttributes<HTMLElement>, "children"> & Record<`data-${string}`, unknown>;

export function FramedPhoto({ src, frame, alt = "", as = "span", loading, children, imgClassName, boxRef, ...rest }: Props) {
  const box = useRef<HTMLElement | null>(null), img = useRef<HTMLImageElement>(null);
  const f = frame ?? DEFAULT_FRAME, latest = useRef(f);
  latest.current = f;
  const place = () => { if (box.current && img.current) placePhoto(box.current, img.current, latest.current); };
  useLayoutEffect(() => {
    const b = box.current;
    if (!b) return;
    place(); watch(b, place);
    return () => unwatch(b);
  }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(place, [f.x, f.y, f.zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  // A stable ref callback: an inline one is detached (null) and re-attached on every render, and React re-attaches it
  // only after children's layout effects run, so a child mounting in that render (the framing editor) would see no box.
  const attach = useCallback((el: HTMLElement | null) => { box.current = el; if (boxRef) boxRef.current = el; }, [boxRef]);
  const Tag = as as "span";
  return (
    <Tag ref={attach} data-photo-frame="" {...rest}>
      <img ref={img} src={src} alt={alt} draggable={false} loading={loading} className={imgClassName} style={IMG} onLoad={place} />
      {children}
    </Tag>
  );
}
