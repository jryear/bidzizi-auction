export type Tier = { belowMinor: number | null; raiseMinor: number };
export type Rules = { mode: "tiered" | "fixed"; tiers: Tier[]; fixedIncrementMinor: number | null };

export const BID_CAP = 1_000_000_000;
export const PLEDGE_CAP = 1_000_000;
export const DEFAULT_TIERS: Tier[] = [
  { belowMinor: 50_000, raiseMinor: 2_500 },
  { belowMinor: 100_000, raiseMinor: 5_000 },
  { belowMinor: 250_000, raiseMinor: 10_000 },
  { belowMinor: null, raiseMinor: 25_000 },
];

/** Item override, then the event's fixed increment, then the event's tiers. */
export function increment(current: number, rules: Rules, itemOverride: number | null): number {
  if (itemOverride) return itemOverride;
  if (rules.mode === "fixed" && rules.fixedIncrementMinor) return rules.fixedIncrementMinor;
  for (const tier of rules.tiers) if (tier.belowMinor === null || current < tier.belowMinor) return tier.raiseMinor;
  return rules.tiers[rules.tiers.length - 1].raiseMinor;
}

export function minimumNext(current: number | null, opening: number, rules: Rules, itemOverride: number | null): number | null {
  const next = current === null ? opening : current + increment(current, rules, itemOverride);
  return next <= BID_CAP ? next : null;
}

export function validTiers(value: unknown): Tier[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) return null;
  let previous = 0;
  const tiers: Tier[] = [];
  for (let i = 0; i < value.length; i++) {
    const t = value[i] as Record<string, unknown>;
    if (!t || typeof t !== "object") return null;
    const last = i === value.length - 1;
    const below = t.belowMinor, raise = t.raiseMinor;
    if (typeof raise !== "number" || !Number.isSafeInteger(raise) || raise < 1 || raise > 100_000_000) return null;
    if (last ? below !== null : (typeof below !== "number" || !Number.isSafeInteger(below) || below <= previous)) return null;
    if (!last) previous = below as number;
    tiers.push({ belowMinor: last ? null : (below as number), raiseMinor: raise });
  }
  return tiers;
}

/** $1,234 — cents only when non-zero. */
export function formatMoney(minor: number): string {
  const dollars = Math.floor(minor / 100), rest = minor % 100;
  return `$${dollars.toLocaleString("en-US")}${rest ? `.${String(rest).padStart(2, "0")}` : ""}`;
}
