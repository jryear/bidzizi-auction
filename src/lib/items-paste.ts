// Rows pasted from Excel, Google Sheets or Numbers become item drafts that staff review before anything is saved.
// Pure: no DOM, no network. tests/v1/items-logic.mjs locks the behaviour down.

/** "1,250.50" → 125050 cents. Same rule as the Studio's money fields. */
function parseDollars(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [d, c = ""] = clean.split(".");
  const cents = Number(d) * 100 + Number(c.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export type Column = "title" | "openingMinor" | "category" | "donor" | "short" | "description" | "skip";
export const COLUMN_LABELS: Record<Column, string> = {
  title: "Title", openingMinor: "Starting bid", category: "Category", donor: "Provided by", short: "Short line", description: "Description", skip: "Don't use",
};
export type Draft = { title: string; openingMinor: number | null; category: string; donor: string; short: string; description: string; problems: string[] };

/** Spreadsheet copies are tab-separated, with quotes around cells that hold tabs, quotes or line breaks. Plain CSV works too. */
export function parseTable(text: string): string[][] {
  const delimiter = text.includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { quoted = true; cell = ""; }
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  row.push(cell); rows.push(row);
  const tidy = rows.map(r => r.map(c => c.replace(/ /g, " ").trim()));
  const kept = tidy.filter(r => r.some(Boolean));
  const width = Math.max(0, ...kept.map(r => r.length));
  return kept.map(r => [...r, ...Array(width - r.length).fill("")]);
}

/** "$1,250", "1250.00", "USD 300" → cents. Anything else → null. */
export function moneyCell(text: string): number | null {
  const clean = text.replace(/^(us\s*\$|usd|\$)\s*/i, "").replace(/\s*(usd)$/i, "").trim();
  return clean ? parseDollars(clean) : null;
}

const HEADER: [Column, RegExp][] = [
  ["skip", /^(#|no\.?|num(ber)?|lot\s*(#|no\.?|number)?|item\s*(#|no\.?|number))$/i],
  ["skip", /(retail|value|worth|estimate|msrp|reserve|buy\s*now)/i],
  ["openingMinor", /(start|opening|minimum|min\.?\s*bid|first\s*bid|\bbid\b|price)/i],
  ["short", /(short|subtitle|tagline|summary|blurb|one[-\s]?liner)/i],
  ["description", /(descr|details|notes|about|includes|fine\s*print)/i],
  ["category", /(categor|type|group|section|theme)/i],
  ["donor", /(donor|donated|provided|provider|sponsor|business|company|vendor|exhibitor|from)/i],
  ["title", /(item|title|name|lot|prize|package)/i],
];
const headerColumn = (cell: string): Column | null => {
  if (!cell) return null;
  for (const [col, re] of HEADER) if (re.test(cell)) return col;
  return null;
};

/** Which column is which. A first row of labels ("Item", "Starting bid", …) is read as a header; otherwise columns are
 *  guessed from their contents. Staff can change any guess in the review. */
export function guessColumns(rows: string[][]): { header: boolean; columns: Column[] } {
  const width = rows[0]?.length ?? 0;
  const first = rows[0] ?? [];
  const named = first.map(headerColumn);
  const header = named.filter(Boolean).length >= Math.min(2, width) && !first.some(c => moneyCell(c) !== null);
  if (header) {
    const seen = new Set<Column>();
    const columns = named.map(c => { if (!c || (c !== "skip" && seen.has(c))) return "skip" as Column; seen.add(c); return c; });
    return { header, columns };
  }
  const body = rows;
  const share = (n: number, test: (c: string) => boolean) => {
    const cells = body.map(r => r[n]).filter(Boolean);
    return cells.length ? cells.filter(test).length / cells.length : 0;
  };
  const columns: Column[] = Array(width).fill("skip");
  const isNumberCol = (n: number) => share(n, c => /^#?\d{1,3}$/.test(c)) === 1 && body.every((r, i) => !r[n] || Number(r[n].replace("#", "")) === i + 1 || Number(r[n].replace("#", "")) >= 1);
  const money = [...Array(width).keys()].filter(n => share(n, c => moneyCell(c) !== null) >= 0.6 && !(isNumberCol(n) && share(n, c => /^\$/.test(c)) === 0));
  if (money.length) columns[money[0]] = "openingMinor";
  const text = [...Array(width).keys()].filter(n => columns[n] === "skip" && !money.includes(n) && !isNumberCol(n) && share(n, c => c.length > 0) > 0);
  if (text.length) columns[text[0]] = "title";
  const rest = text.slice(1);
  const repeats = (n: number) => { const cells = body.map(r => r[n]).filter(Boolean); return cells.length ? 1 - new Set(cells.map(c => c.toLowerCase())).size / cells.length : 0; };
  const avgLength = (n: number) => { const cells = body.map(r => r[n]).filter(Boolean); return cells.reduce((s, c) => s + c.length, 0) / Math.max(1, cells.length); };
  const cat = rest.find(n => repeats(n) >= 0.3 && avgLength(n) <= 30);
  if (cat !== undefined) columns[cat] = "category";
  const longText = rest.find(n => columns[n] === "skip" && avgLength(n) > 60);
  if (longText !== undefined) columns[longText] = "description";
  const donor = rest.find(n => columns[n] === "skip");
  if (donor !== undefined) columns[donor] = "donor";
  return { header, columns };
}

const LIMITS: Record<Exclude<Column, "skip" | "openingMinor">, number> = { title: 200, category: 100, donor: 200, short: 500, description: 10_000 };

export function draftsFrom(rows: string[][], columns: Column[], header: boolean): Draft[] {
  return (header ? rows.slice(1) : rows).map(r => {
    const d: Draft = { title: "", openingMinor: null, category: "", donor: "", short: "", description: "", problems: [] };
    columns.forEach((col, n) => {
      const cell = r[n] ?? "";
      if (col === "skip" || !cell) return;
      if (col === "openingMinor") { d.openingMinor = moneyCell(cell); if (d.openingMinor === null) d.problems.push(`"${cell}" isn't an amount`); return; }
      d[col] = d[col] ? `${d[col]} ${cell}` : cell;
    });
    for (const [field, max] of Object.entries(LIMITS) as [keyof typeof LIMITS, number][]) if (d[field].length > max) d.problems.push(`${COLUMN_LABELS[field]} is longer than ${max} characters`);
    if (!d.title) d.problems.push("Needs a title");
    if (d.openingMinor === null && !d.problems.some(p => p.includes("isn't an amount"))) d.problems.push("Needs a starting bid");
    if (d.openingMinor !== null && (d.openingMinor < 1 || d.openingMinor > 1_000_000_000)) d.problems.push("Starting bid is out of range");
    return d;
  });
}

/** Pasted text that looks like several spreadsheet rows (rather than one title) opens the review instead of a single add. */
export const looksLikeRows = (text: string) => /\t/.test(text) || text.trim().split(/\r?\n/).filter(l => l.trim()).length > 1;
