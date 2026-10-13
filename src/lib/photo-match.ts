// Many photos dropped at once are matched to items before anything uploads: by file name (an item number such as
// "07.jpg" or "lot-7-cabin.png", or words from the title) or simply in order. Staff review every pair first.
// Pure: no DOM, no network. tests/v1/items-logic.mjs locks the behaviour down.

export type MatchItem = { id: string; title: string; position: number; hasPhoto: boolean };
export type MatchMode = "name" | "order";

const STOP = new Set(["a", "an", "the", "and", "of", "for", "with", "to", "in", "on", "at", "by", "or", "&"]);
const LABELS = new Set(["lot", "item", "no", "number", "photo", "pic", "picture", "image", "img", "final", "edit", "copy", "web", "hi", "res", "hires", "lowres"]);
const words = (text: string) => text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/['’]/g, "")
  .split(/[^a-z0-9]+/).filter(Boolean);
const stem = (w: string) => w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w;
const fileWords = (name: string) => words(name.replace(/\.[a-z0-9]{2,5}$/i, ""));

/** Natural order, so "2.jpg" comes before "10.jpg". */
export const byFileName = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

function score(file: string[], title: string): number {
  const t = new Set(words(title).filter(w => !STOP.has(w)).map(stem));
  const f = file.filter(w => !STOP.has(w) && !LABELS.has(w) && !/^\d+$/.test(w)).map(stem);
  if (!f.length || !t.size) return 0;
  // The share of the file's own words found in the title: "bicycle_final.png" fully names "Restored city bicycle".
  return f.filter(w => t.has(w)).length / f.length;
}

/** An item number in the name counts only when the rest of the name is labels ("lot", "photo") or title words,
 *  so a camera name like "DSC_0012" never lands on item 12. */
function numbered(file: string[], items: MatchItem[]): MatchItem | null {
  const nums = file.filter(w => /^\d{1,3}$/.test(w));
  if (nums.length !== 1) return null;
  const item = items.find(i => i.position + 1 === Number(nums[0]));
  if (!item) return null;
  const others = file.filter(w => !/^\d+$/.test(w) && !LABELS.has(w) && !STOP.has(w));
  return !others.length || score(file, item.title) >= 0.5 ? item : null;
}

/** One item id (or null) per file, in the files' order. No item gets two photos. */
export function matchPhotos(fileNames: string[], items: MatchItem[], mode: MatchMode): (string | null)[] {
  const out: (string | null)[] = fileNames.map(() => null);
  const taken = new Set<string>();
  if (mode === "order") {
    const sorted = fileNames.map((name, n) => ({ name, n })).sort((a, b) => byFileName(a.name, b.name));
    const ordered = [...items].sort((a, b) => a.position - b.position);
    const targets = [...ordered.filter(i => !i.hasPhoto), ...ordered.filter(i => i.hasPhoto)];
    sorted.forEach(({ n }, k) => { out[n] = targets[k]?.id ?? null; });
    return out;
  }
  const parsed = fileNames.map(fileWords);
  parsed.forEach((f, n) => {
    const hit = numbered(f, items);
    if (hit && !taken.has(hit.id)) { out[n] = hit.id; taken.add(hit.id); }
  });
  const pairs: { n: number; id: string; s: number }[] = [];
  parsed.forEach((f, n) => {
    if (out[n]) return;
    for (const item of items) { const s = score(f, item.title); if (s >= 0.5) pairs.push({ n, id: item.id, s }); }
  });
  pairs.sort((a, b) => b.s - a.s);
  for (const p of pairs) {
    if (out[p.n] || taken.has(p.id)) continue;
    // A tie between two items for the same file is ambiguous; leave it for staff to choose.
    if (pairs.some(q => q.n === p.n && q.id !== p.id && q.s === p.s)) continue;
    out[p.n] = p.id; taken.add(p.id);
  }
  return out;
}
