"use client";
// The sign-in scene: a last-minute bidding war, played on BidZizi's real components. The stage display and two guests'
// phones read one scripted auction, so a bid visibly lands everywhere at once: the amount rolls on the projector, one
// phone turns green, the other gets the outbid alert, then the winner's phone celebrates.
// Purely decorative (aria-hidden, inert). Nothing here talks to the server; it loads after the sign-in form.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { increment, DEFAULT_TIERS } from "../../lib/money";
import { ItemCard } from "../e/[code]/ui";
import { Alerts, Celebration, type Alert } from "../e/[code]/moments";
import type { Item } from "../e/[code]/model";
import { StageView, type StageData } from "./[id]/stage/stage";

type Who = "A" | "B" | "C" | "D";
const PEOPLE: Record<Who, { name: string; business: string }> = {
  A: { name: "Alice Chen", business: "Juniper Design" }, B: { name: "Ben Ortiz", business: "Harbor LLC" },
  C: { name: "Cara Singh", business: "Cedar Dental" }, D: { name: "Dev Patel", business: "Northpoint IT" },
};
type Lot = { id: string; position: number; title: string; short: string; donor: string; category: string; photo: string; opening: number;
  current: number | null; leader: Who | null; bids: number; closesIn: number; closed: boolean; mine: Partial<Record<Who, number>> };
type World = { t0: number; lots: Lot[]; activity: { id: string; itemId: string; amountMinor: number; who: Who; at: number }[]; alertA: Alert | null; tap: "A" | "B" | null; won: boolean };

const RULES = { mode: "tiered" as const, tiers: DEFAULT_TIERS, fixedIncrementMinor: null };
const next = (lot: Lot) => lot.current === null ? lot.opening : lot.current + increment(lot.current, RULES, null);
// The scene is about the last seconds: the cabin closes 11.5s in.
const CLOSE_MS = 11_500, LOOP_MS = 16_500;

function start(now: number): World {
  const lot = (o: Omit<Lot, "closed" | "mine"> & { mine?: Lot["mine"] }): Lot => ({ closed: false, mine: {}, ...o });
  return {
    t0: now, tap: null, won: false, alertA: null,
    lots: [
      lot({ id: "cabin", position: 0, title: "Weekend cabin in Big Bear", short: "Two nights for four, hot tub included", donor: "Pine Ridge Rentals", category: "Travel", photo: "/hero/cabin.webp",
        opening: 30_000, current: 40_000, leader: "A", bids: 5, closesIn: CLOSE_MS, mine: { A: 40_000, B: 37_500 } }),
      lot({ id: "chef", position: 1, title: "Chef's table dinner for six", short: "Seven courses with wine pairing", donor: "Marrow & Vine", category: "Dining", photo: "/hero/dinner.webp",
        opening: 25_000, current: 32_500, leader: "C", bids: 3, closesIn: 34 * 60_000 }),
      lot({ id: "coffee", position: 2, title: "Coffee for a year", short: "Single-origin beans every month", donor: "Harbor Roasters", category: "Food & drink", photo: "/hero/coffee.webp",
        opening: 15_000, current: 20_000, leader: "D", bids: 2, closesIn: 41 * 60_000 }),
    ],
    activity: [
      { id: "a3", itemId: "cabin", amountMinor: 40_000, who: "A", at: now - 20_000 },
      { id: "a2", itemId: "cabin", amountMinor: 37_500, who: "B", at: now - 45_000 },
      { id: "a1", itemId: "chef", amountMinor: 32_500, who: "C", at: now - 70_000 },
      { id: "a0", itemId: "coffee", amountMinor: 20_000, who: "D", at: now - 90_000 },
    ],
  };
}
function bid(w: World, itemId: string, who: Who, at: number): World {
  const lots = w.lots.map(l => {
    if (l.id !== itemId) return l;
    const amount = next(l);
    return { ...l, current: amount, leader: who, bids: l.bids + 1, mine: { ...l.mine, [who]: amount } };
  });
  const lot = lots.find(l => l.id === itemId)!;
  return { ...w, lots, tap: null, activity: [{ id: `b${at}`, itemId, amountMinor: lot.current!, who, at }, ...w.activity].slice(0, 8) };
}

/** The beats, as offsets from the start of each loop. */
const BEATS: [number, (w: World, at: number) => World][] = [
  [1_900, w => ({ ...w, tap: "B" })],
  [2_500, (w, at) => {
    const out = bid(w, "cabin", "B", at), cabin = out.lots[0];
    return { ...out, alertA: { id: `o${at}`, tone: "red", title: "Outbid on Weekend cabin in Big Bear", body: `${PEOPLE.B.business} bid $${cabin.current! / 100}`, itemId: "cabin", action: { label: `Bid $${next(cabin) / 100}`, amount: next(cabin) } } };
  }],
  [5_300, w => ({ ...w, tap: "A" })],
  [5_900, (w, at) => ({ ...bid(w, "cabin", "A", at), alertA: null })],
  [7_700, (w, at) => bid(w, "chef", "D", at)],
  [8_700, w => ({ ...w, tap: "B" })],
  [9_300, (w, at) => bid(w, "cabin", "B", at)],
  [10_300, (w, at) => ({ ...bid(w, "cabin", "A", at), alertA: null })],
  [CLOSE_MS, w => ({ ...w, lots: w.lots.map(l => l.id === "cabin" ? { ...l, closed: true } : l) })],
  [CLOSE_MS + 900, w => ({ ...w, won: true })],
];

/** A guest's view of one lot, through the same standing rules the guest app uses. */
function seen(lot: Lot, who: Who, now: number, t0: number): Item {
  const closesAt = new Date(t0 + lot.closesIn).toISOString();
  const phase = lot.closed || now >= t0 + lot.closesIn ? "closed" : "open";
  const leader = lot.leader ? { ...PEOPLE[lot.leader], isMe: lot.leader === who } : null;
  return {
    // Each phone holds its own copy, so the guest card's view-transition names stay unique on the page.
    id: `${lot.id}-${who}`, position: lot.position, title: lot.title, short: lot.short, description: "", category: lot.category, donor: lot.donor, imageUrl: lot.photo,
    openingMinor: lot.opening, opensAt: new Date(t0 - 3_600_000).toISOString(), closesAt, phase, currentMinor: lot.current, bidCount: lot.bids, leader,
    minimumNextMinor: phase === "open" ? next(lot) : null, incrementMinor: increment(lot.current ?? lot.opening, RULES, null), watching: lot.id === "cabin",
    myHighestMinor: lot.mine[who] ?? null, myBidCount: lot.mine[who] ? 1 : 0,
    award: phase === "closed" && lot.leader ? { status: "assigned", winner: PEOPLE[lot.leader], amountMinor: lot.current, isMe: lot.leader === who } : null,
  };
}

function stageData(w: World, now: number): StageData {
  return {
    serverNow: new Date(now).toISOString(),
    event: { id: "scene", name: "Holiday Trade Show", code: "SATURN", theme: "classic", status: "live", startsAt: new Date(w.t0 - 3_600_000).toISOString(), endsAt: new Date(w.t0 + 41 * 60_000).toISOString(), phase: "open", accentColor: null },
    items: w.lots.map(l => ({ id: l.id, position: l.position, title: l.title, donor: l.donor, category: l.category, imageUrl: l.photo, openingMinor: l.opening, currentMinor: l.current, bidCount: l.bids,
      phase: l.closed || now >= w.t0 + l.closesIn ? "closed" : "open", effectiveClosesAt: new Date(w.t0 + l.closesIn).toISOString(), leader: l.leader ? { name: "", business: PEOPLE[l.leader].business } : null })),
    activity: w.activity.map(a => ({ id: a.id, itemId: a.itemId, amountMinor: a.amountMinor, at: new Date(a.at).toISOString(), name: "", business: PEOPLE[a.who].business })),
    bidders: 61, givenMinor: 0,
  };
}

/** Plays the scene on a loop, or holds one telling frame when motion is reduced. Pauses when off screen or hidden. */
function useScene(still: boolean) {
  const [world, setWorld] = useState<World>(() => start(Date.now()));
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = root.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    io.observe(el);
    const vis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, []);
  useEffect(() => {
    if (still) {
      // The frame that says it all: a bid has just landed on the big screen; one phone leads, the other was outbid.
      const t = Date.now(); let w = start(t);
      w = BEATS[1][1](w, t); setWorld(w); setNow(t + 4_000);
      return;
    }
    if (!visible) return;
    let w = start(Date.now()), beat = 0, frame = 0;
    setWorld(w);
    const tick = () => {
      const t = Date.now(), at = t - w.t0;
      while (beat < BEATS.length && at >= BEATS[beat][0]) { w = BEATS[beat][1](w, t); beat++; setWorld(w); }
      if (at >= LOOP_MS) { w = start(t); beat = 0; setWorld(w); }
      setNow(t);
    };
    const timer = setInterval(tick, 200);
    tick();
    return () => { clearInterval(timer); cancelAnimationFrame(frame); };
  }, [still, visible]);
  return { world, now, root };
}

function Phone({ who, world, now, className }: { who: Who; world: World; now: number; className: string }) {
  const me = PEOPLE[who];
  const items = world.lots.slice(0, 2).map(l => seen(l, who, now, world.t0));
  const cabin = items[0];
  const alerts = who === "A" && world.alertA ? [world.alertA] : [];
  return (
    <div className={`lh-phone ${className}${world.tap === who ? " is-tapping" : ""}`}>
      <div className="lh-screen">
        <div className="pa is-canvas lh-pa" data-theme="classic" data-screen="items">
          <div className="pa-pass static"><div className="pass-badge"><span className="mark ci you" style={{ "--s": "40px" } as CSSProperties}>{me.business.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
            <span className="pass-text"><b>{me.business}</b><small>{me.name}</small></span></div>
            <div className="pass-event"><span className="pass-ev-name">Holiday Trade Show</span><span className="pass-ev-code">SATURN</span></div></div>
          <div className="cards lh-cards">{items.map(i => <ItemCard key={i.id} item={i} now={now} canWatch onRebid={() => {}} />)}</div>
          <Alerts alerts={alerts} onDismiss={() => {}} onAct={() => {}} />
          {who === "A" && world.won && cabin.award?.isMe && <Celebration item={cabin} code="SATURN" instructions="Collect it at the Saturn desk before 8 PM." onClose={() => {}} ambient />}
        </div>
      </div>
    </div>
  );
}

export default function SignInHero() {
  const [still, setStill] = useState(false);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    setStill(q.matches);
    const on = () => setStill(q.matches);
    q.addEventListener("change", on); return () => q.removeEventListener("change", on);
  }, []);
  const { world, now, root } = useScene(still);
  const stage = useMemo(() => stageData(world, now), [world, now]);
  // The real stage sizes itself in --vw/--vh; give it a frame's worth instead of the window's.
  const frame = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 640 });
  useEffect(() => {
    const el = frame.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width }));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const h = box.w * 9 / 16;
  return (
    <div className={`lh-scene${still ? " still" : ""}`} ref={root} aria-hidden="true" inert>
      <div className="lh-beam" />
      <div className="lh-floor" />
      <div className="lh-screenframe" ref={frame}>
        <div className="lh-stage" style={{ "--vw": `${box.w / 100}px`, "--vh": `${h / 100}px`, "--stage-h": `${h}px` } as CSSProperties}>
          <StageView data={stage} origin="https://app.bidzizi.com" idle offline={false} />
        </div>
      </div>
      <Phone who="B" world={world} now={now} className="p-b" />
      <Phone who="A" world={world} now={now} className="p-a" />
    </div>
  );
}
