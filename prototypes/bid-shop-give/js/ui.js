// Shared bits: escaping, icons, shop tile art, time.
export const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const initials = s => s.split(/[\s&]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();

const svg = (d, size = 20, extra = "") => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const I = {
  grid: s => svg('<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>', s),
  bag: s => svg('<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>', s),
  ticket: s => svg('<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4V7.5Z"/><path d="M14 6v12" stroke-dasharray="2 2.2"/>', s),
  info: s => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/>', s),
  heart: (s, filled) => svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>', s, filled ? 'fill="currentColor"' : ""),
  chevL: s => svg('<path d="m14.5 5.5-6 6.5 6 6.5"/>', s),
  chevR: s => svg('<path d="m9.5 5.5 6 6.5-6 6.5"/>', s),
  search: s => svg('<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>', s),
  bookmark: (s, on) => svg('<path d="M7 4.5h10v15l-5-3.5-5 3.5v-15Z"/>', s, on ? 'fill="currentColor"' : ""),
  plus: s => svg('<path d="M12 5v14M5 12h14"/>', s),
  minus: s => svg('<path d="M5 12h14"/>', s),
  check: s => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', s),
  clock: s => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', s),
  pin: s => svg('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>', s),
  wifiOff: s => svg('<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 4.5-2.4M19 12.5a10 10 0 0 0-3-2"/><path d="M12 20h.01"/>', s),
  gavel: s => svg('<path d="m14 4 6 6"/><path d="m11.5 6.5 6 6"/><path d="m12.75 5.25-4.5 4.5 6 6 4.5-4.5"/><path d="M9.5 11 3.5 17a1.4 1.4 0 0 0 2 2l6-6"/>', s),
  x: s => svg('<path d="M6 6l12 12M18 6 6 18"/>', s),
  more: s => svg('<circle cx="6" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18" cy="12" r="1.2"/>', s),
};

// Shop items in the prototype have drawn tiles, not photos (we only have six synthetic photos, all used by auctions).
const ART = {
  gift: '<rect x="22" y="40" width="56" height="42" rx="3"/><rect x="18" y="30" width="64" height="12" rx="3"/><path d="M50 30v52"/><path d="M50 30c-6-12-20-12-18-3 1 4 10 4 18 3Zm0 0c6-12 20-12 18-3-1 4-10 4-18 3Z"/>',
  bag: '<path d="M30 30h40l4 52H26l4-52Z"/><path d="M30 30c0-6 4-9 6-9h28c2 0 6 3 6 9"/><circle cx="50" cy="56" r="8"/><path d="M46 56h8"/>',
  candle: '<rect x="20" y="48" width="16" height="32" rx="2"/><rect x="42" y="40" width="16" height="40" rx="2"/><rect x="64" y="52" width="16" height="28" rx="2"/><path d="M28 48v-6M50 40v-6M72 52v-6"/><path d="M28 38c-3-4 0-8 0-8s3 4 0 8ZM50 30c-3-4 0-8 0-8s3 4 0 8ZM72 42c-3-4 0-8 0-8s3 4 0 8Z"/>',
  ornament: '<circle cx="34" cy="52" r="13"/><circle cx="66" cy="52" r="13"/><circle cx="50" cy="72" r="10"/><path d="M34 39v-6M66 39v-6M50 62v-5"/><path d="M23 52h22M55 52h22"/>',
  tin: '<ellipse cx="50" cy="38" rx="28" ry="8"/><path d="M22 38v34c0 4.4 12.5 8 28 8s28-3.6 28-8V38"/><path d="M22 50c0 4.4 12.5 8 28 8s28-3.6 28-8"/><circle cx="40" cy="66" r="3"/><circle cx="56" cy="69" r="3"/><circle cx="62" cy="62" r="2"/>',
  wreath: '<circle cx="50" cy="52" r="24"/><circle cx="50" cy="52" r="13"/><path d="M42 26l8 8 8-8"/><circle cx="34" cy="40" r="2.5"/><circle cx="68" cy="44" r="2.5"/><circle cx="62" cy="72" r="2.5"/><circle cx="36" cy="66" r="2.5"/>',
};
export function tile(item, cls = "") {
  return `<div class="tile ${cls}" style="--tint:${item.tint}" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ART[item.art] ?? ART.gift}</svg></div>`;
}
export function photo(item, cls = "") {
  return item.kind === "shop" ? tile(item, cls) : `<img class="${cls}" src="img/${item.photo}.jpg" alt="" loading="lazy">`;
}

export function left(ms) {
  if (ms <= 0) return "0m";
  const m = Math.floor(ms / 60000), hrs = Math.floor(m / 60);
  return hrs ? `${hrs}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}
export const clock = t => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
