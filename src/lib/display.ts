// What a participant sees for an item: its standing, and which amount leads. Pure and dependency-free, so the rules are
// locked down by tests/v1/display-logic.mjs and every card, row, page, ticket and sheet renders from the same answer.
//
// The display rules (Zack, passthrough 1):
// - Outbid: lead with the current top bid and "Bid $X". Your own losing bid is not prominent; it lives in your history.
// - Leading: your bid is the top bid, shown as such.
// - No bids yet (including saved/watched items): the starting amount. Otherwise the current top bid.

export type DisplayItem = {
  phase: "scheduled" | "open" | "closed";
  currentMinor: number | null;
  openingMinor: number;
  minimumNextMinor: number | null;
  leader: { isMe: boolean } | null;
  myBidCount: number;
  myHighestMinor: number | null;
  award: { status: string; amountMinor: number | null; isMe: boolean } | null;
  withdrawn?: boolean;
  bidHistory?: { isMe: boolean; voided: boolean }[];
};

export type StandingKey =
  | "unconfirmed" | "withdrawn" | "scheduled" | "leading" | "outbid" | "voided" | "open"
  | "won" | "awaiting" | "lost" | "sold" | "closed";

export function standingKey(item: DisplayItem, unconfirmed = false): StandingKey {
  if (unconfirmed) return "unconfirmed";
  if (item.withdrawn) return "withdrawn";
  if (item.phase === "scheduled") return "scheduled";
  const mineVoided = (item.bidHistory ?? []).some(b => b.isMe && b.voided);
  if (item.phase === "open") {
    if (item.leader?.isMe) return "leading";
    if (item.myBidCount > 0) return "outbid";
    if (mineVoided) return "voided";
    return "open";
  }
  if (item.award?.isMe) return "won";
  if (!item.award && item.leader?.isMe) return "awaiting";
  if (item.myBidCount > 0) return "lost";
  if (item.award && item.award.status !== "no_winner") return "sold";
  return "closed";
}

export type Headline = { label: string; amountMinor: number; yours: boolean };

/** The one amount an item leads with, and what to call it. */
export function headline(item: DisplayItem, unconfirmed = false): Headline {
  const key = standingKey(item, unconfirmed);
  const top = item.currentMinor;
  if (key === "won") return { label: "You won at", amountMinor: item.award?.amountMinor ?? top ?? item.openingMinor, yours: true };
  if (key === "leading") return { label: "Your bid is the top bid", amountMinor: top!, yours: true };
  if (key === "awaiting") return { label: "Your top bid", amountMinor: top!, yours: true };
  if (top === null) return { label: "Starting bid", amountMinor: item.openingMinor, yours: false };
  if (item.phase === "closed" || key === "withdrawn") return { label: "Final bid", amountMinor: top, yours: false };
  return { label: "Top bid", amountMinor: top, yours: false };
}

/** The bid button's amount: the next minimum while the item takes bids, otherwise none. */
export function nextBid(item: DisplayItem, unconfirmed = false): number | null {
  const key = standingKey(item, unconfirmed);
  if (key === "leading" || key === "unconfirmed" || item.phase !== "open" || item.withdrawn) return null;
  return item.minimumNextMinor;
}
