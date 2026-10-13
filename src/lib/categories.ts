// An event's categories: one tidy spelling per name, compared without case, in the order staff arrange them.
// Shared by the server (which enforces it) and the Studio (which previews it).

export const CATEGORY_MAX = 100, CATEGORY_LIMIT = 100;

/** Trim and collapse inner whitespace, so "Food  &  drink " and "Food & drink" are the same category. */
export const tidyCategory = (raw: string) => raw.replace(/\s+/g, " ").trim();
export const sameCategory = (a: string, b: string) => tidyCategory(a).toLocaleLowerCase("en-US") === tidyCategory(b).toLocaleLowerCase("en-US");

/** The stored order first, then any category an item uses that the list doesn't name yet, in item order. */
export function orderedCategories(stored: readonly string[], items: readonly { category: string; position: number }[]): string[] {
  const out: string[] = [];
  const add = (c: string) => { const t = tidyCategory(c); if (t && !out.some(x => x === t)) out.push(t); };
  stored.forEach(add);
  [...items].sort((a, b) => a.position - b.position).forEach(i => add(i.category));
  return out;
}

/** The spelling to store for a typed category: an existing one when it matches without case, otherwise the tidy text. */
export function canonicalCategory(raw: string, known: readonly string[]): string {
  const t = tidyCategory(raw);
  return t ? known.find(k => sameCategory(k, t)) ?? t : "";
}
