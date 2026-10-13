/** Position belongs to the use of a photo, never its immutable asset. */
export type FocalPoint = { x: number; y: number };
export const CENTER: FocalPoint = { x: 0.5, y: 0.5 };
export function photoStyle(point?: FocalPoint | null) {
  const p = point ?? CENTER;
  return { objectPosition: `${p.x * 100}% ${p.y * 100}%` };
}
export function validFocal(value: unknown): value is FocalPoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as FocalPoint;
  return [p.x, p.y].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1);
}
