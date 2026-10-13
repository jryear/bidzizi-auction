// Colour helpers for the custom accent: WCAG contrast, and a nudge toward a readable shade.
import type { CSSProperties } from "react";

const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (rgb: number[]) => "#" + rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

export function luminance(h: string) {
  const [r, g, b] = hex(h).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** The accent sits behind dark text ("yours" badges) and as a highlight on the dark pass, so it must contrast with the
 *  theme's ink. 4.5:1 is the WCAG AA bar for text. */
export const ACCENT_MIN = 4.5;
export function accentReadable(accent: string, ink: string) { return contrast(accent, ink) >= ACCENT_MIN; }

/** The nearest lighter shade of the accent that reads against the ink (mixing toward white keeps the hue). */
export function readableAccent(accent: string, ink: string): string {
  if (accentReadable(accent, ink)) return accent;
  const [r, g, b] = hex(accent);
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = toHex([r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t]);
    if (accentReadable(candidate, ink)) return candidate;
  }
  return "#FFFFFF";
}

/** CSS variables that apply a custom accent on top of a theme. */
export function accentVars(accent: string | null | undefined): CSSProperties | undefined {
  if (!accent) return undefined;
  return { "--marigold": accent, "--marigold-bg": `color-mix(in srgb, ${accent} 24%, #ffffff)` } as CSSProperties;
}
