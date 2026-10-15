/** Framing belongs to the use of a photo (event cover, item photo), never its immutable asset.
 *  A frame is { x, y, zoom }: (x, y) is the photo point at the centre of whatever box shows it, in 0–1 of the photo's
 *  width and height; zoom ≥ 1 magnifies the cover fit (1 = the photo just covers the box). Rendering clamps so the
 *  photo always fills the box, so the same frame keeps the same subject in view at every shape. */
export type Frame = { x: number; y: number; zoom: number };
export const MIN_ZOOM = 1, MAX_ZOOM = 4;
export const DEFAULT_FRAME: Frame = { x: 0.5, y: 0.5, zoom: 1 };

const unit = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

/** Exactly { x, y, zoom } with x, y in [0, 1] and zoom in [1, 4]. */
export function validFrame(value: unknown): value is Frame {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const f = value as Record<string, unknown>;
  return unit(f.x) && unit(f.y) && typeof f.zoom === "number" && Number.isFinite(f.zoom) && f.zoom >= MIN_ZOOM && f.zoom <= MAX_ZOOM;
}
/** The pre-zoom focal point, still accepted from older Studio tabs: it moves the centre and keeps the zoom. */
export function validFocal(value: unknown): value is { x: number; y: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  return unit(p.x) && unit(p.y);
}
/** A stored frame (possibly from before zoom existed, or missing) as a complete frame. */
export function frameOf(stored: unknown): Frame {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_FRAME };
  const s = stored as Record<string, unknown>;
  const x = unit(s.x) ? s.x as number : 0.5, y = unit(s.y) ? s.y as number : 0.5;
  const zoom = typeof s.zoom === "number" && Number.isFinite(s.zoom) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom)) : 1;
  return { x, y, zoom };
}
export const sameFrame = (a: Frame, b: Frame) => Math.abs(a.x - b.x) < 1e-4 && Math.abs(a.y - b.y) < 1e-4 && Math.abs(a.zoom - b.zoom) < 1e-4;

/** Where the photo sits inside a box of boxW × boxH for a photo of natW × natH: its size and top-left offset in the box's
 *  pixels. Cover fit × zoom, then (x, y) moved to the centre, clamped so the photo always covers the box. */
export function frameLayout(boxW: number, boxH: number, natW: number, natH: number, frame: Frame) {
  const scale = Math.max(boxW / natW, boxH / natH) * Math.max(MIN_ZOOM, frame.zoom);
  const width = natW * scale, height = natH * scale;
  const left = Math.min(0, Math.max(boxW - width, boxW / 2 - frame.x * width));
  const top = Math.min(0, Math.max(boxH - height, boxH / 2 - frame.y * height));
  return { width, height, left, top };
}
/** The frame that this box actually shows: x, y pulled in to the range the clamp allows. Editing works in these terms, so
 *  dragging never has a dead zone past the photo's edge. */
export function clampFrame(boxW: number, boxH: number, natW: number, natH: number, frame: Frame): Frame {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, frame.zoom));
  const { width, height, left, top } = frameLayout(boxW, boxH, natW, natH, { ...frame, zoom });
  const r = (n: number) => Math.round(n * 10_000) / 10_000;
  return { x: r((boxW / 2 - left) / width), y: r((boxH / 2 - top) / height), zoom: r(zoom) };
}
