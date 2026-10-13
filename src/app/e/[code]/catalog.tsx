"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtClock, fmtTime } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { IBookmark, ICards, IChevD, IChevR, IHeart, IList, ISearch, ITrophy } from "../../../lib/icons";
import { closingSoon, countdown, sortItems, standing, type PendingBid, type Snapshot, type Sort } from "./model";
import type { Nav } from "./participant";
import { EmptyState, ItemCard, ItemRow, Mark, TimeLeft } from "./ui";

type Props = { snap: Snapshot; now: number; nav: Nav; code: string; stale: boolean; pending: PendingBid | null; cameFrom: string | null; watching?: boolean };

export function EventClock({ snap, now }: { snap: Snapshot; now: number }) {
  const e = snap.event;
  if (e.phase === "open") return <span className="clock live"><i aria-hidden="true" />Bidding ends {fmtClock(e.endsAt, e.timezone)} · <b>{countdown(e.endsAt, now)}</b> left</span>;
  if (e.phase === "upcoming") return <span className="clock"><i aria-hidden="true" />Bidding opens {fmtTime(e.startsAt, e.timezone)}</span>;
  return <span className="clock done"><i aria-hidden="true" />Bidding has ended</span>;
}

export function Catalog({ snap, now, nav, stale, pending, cameFrom, watching = false }: Props) {
  const [query, setQuery] = useState(""), [category, setCategory] = useState("");
  const [sort, setSort] = useState<Sort>("order");
  const [view, setView] = useState<"cards" | "rows">("cards");
  useEffect(() => { try { const v = localStorage.getItem("bz_view"); if (v === "rows" || v === "cards") setView(v); } catch { /* ignore */ } }, []);
  const pickView = (v: "cards" | "rows") => { setView(v); try { localStorage.setItem("bz_view", v); } catch { /* ignore */ } };

  const base = watching ? snap.items.filter(i => i.watching) : snap.items;
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of base) if (i.category) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    return [...counts];
  }, [base]);
  const q = query.trim().toLowerCase();
  const list = sortItems(base.filter(i => (!category || i.category === category) && (!q || `${i.title} ${i.short} ${i.donor} ${i.category}`.toLowerCase().includes(q))), sort, now);
  const e = snap.event;
  const Comp = view === "cards" ? ItemCard : ItemRow;

  return (
    <div className="cat-layout">
      <div className="cat-main">
        <section className="page-head">
          <h1>{watching ? "Watching" : "Items"}</h1>
          <p className="sub"><EventClock snap={snap} now={now} /></p>
        </section>
        {!watching && <StandingStrip snap={snap} nav={nav} />}

        {base.length > 0 && (
          <div className="controls">
            {base.length > 3 && (
              <label className="search">
                <ISearch size={19} />
                <input type="search" placeholder={watching ? "Search your watchlist" : "Search items, providers"} value={query} onChange={x => setQuery(x.target.value)} aria-label="Search items" />
              </label>
            )}
            {categories.length > 1 && (
              <div className="pa-chips" role="group" aria-label="Category">
                <button type="button" className={`pa-chip${!category ? " on" : ""}`} aria-pressed={!category} onClick={() => setCategory("")}>All</button>
                {categories.map(([c, n]) => <button type="button" key={c} className={`pa-chip${category === c ? " on" : ""}`} aria-pressed={category === c} onClick={() => setCategory(category === c ? "" : c)}>{c}<small>{n}</small></button>)}
              </div>
            )}
            <div className="toolbar">
              <span className="tb-count">{list.length === base.length ? `${base.length} item${base.length === 1 ? "" : "s"}` : `${list.length} of ${base.length}`}</span>
              <label className="sort">
                <span className="sr">Sort</span>
                <select value={sort} onChange={x => setSort(x.target.value as Sort)}>
                  <option value="order">Item order</option>
                  <option value="ending">Ending soonest</option>
                  <option value="low">Lowest price</option>
                </select>
                <IChevD size={18} />
              </label>
              <div className="seg" role="group" aria-label="Layout">
                <button type="button" aria-pressed={view === "cards"} aria-label="Large cards" onClick={() => pickView("cards")}><ICards size={20} /></button>
                <button type="button" aria-pressed={view === "rows"} aria-label="Compact list" onClick={() => pickView("rows")}><IList size={20} /></button>
              </div>
            </div>
          </div>
        )}

        {!base.length ? (
          watching
            ? <EmptyState icon={<IBookmark size={28} />} title="Nothing watched yet"><p>Tap the bookmark on an item to follow it here.</p><button type="button" className="btn quiet" onClick={() => nav.tab("items")}>Browse items</button></EmptyState>
            : <EmptyState title="No items yet"><p>They&rsquo;ll appear here as soon as the host adds them.</p></EmptyState>
        ) : !list.length ? (
          <EmptyState icon={<ISearch size={28} />} title="No matches"><p>Nothing matches &ldquo;{query || category}&rdquo;.</p><button type="button" className="btn quiet" onClick={() => { setQuery(""); setCategory(""); }}>Clear search</button></EmptyState>
        ) : (
          <div className={view === "cards" ? "cards" : "rows"}>
            {list.map(item => (
              <Comp key={item.id} item={item} now={now} stale={stale} here={item.id === cameFrom} unconfirmed={pending?.itemId === item.id}
                onOpen={() => nav.openItem(item.id)} onWatch={on => nav.watch(item, on)} onRebid={() => nav.openSheet(item, item.minimumNextMinor ?? undefined)} />
            ))}
          </div>
        )}
      </div>
      <Rail snap={snap} now={now} nav={nav} />
    </div>
  );
}

/** Where you stand, in one glance, linking to My bids. */
export function StandingStrip({ snap, nav }: { snap: Snapshot; nav: Nav }) {
  const counts = { outbid: 0, leading: 0, won: 0 };
  for (const i of snap.items) { const k = standing(i).key; if (k === "outbid" || k === "leading" || k === "won") counts[k]++; }
  if (!counts.outbid && !counts.leading && !counts.won) return null;
  return (
    <button type="button" className={`strip${counts.outbid ? " has-outbid" : ""}`} onClick={() => nav.tab("mine")}>
      {counts.won > 0 && <span className="s-won"><ITrophy size={17} />{counts.won} won</span>}
      {counts.outbid > 0 && <span className="s-out"><i />{counts.outbid} outbid</span>}
      {counts.leading > 0 && <span className="s-lead"><i />{counts.leading} leading</span>}
      <span className="s-go">My bids<IChevR size={16} /></span>
    </button>
  );
}

function Rail({ snap, now, nav }: { snap: Snapshot; now: number; nav: Nav }) {
  const soon = snap.items.filter(i => i.phase === "open").sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime()).slice(0, 4);
  return (
    <aside className="rail" aria-label="Your event">
      {soon.length > 0 && (
        <div className="rail-card">
          <span className="lbl">Ending soonest</span>
          <ul className="soonlist">
            {soon.map(i => (
              <li key={i.id}><button type="button" onClick={() => nav.openItem(i.id)}>
                <span className="sl-t">{i.title}</span>
                <span className={`sl-m${closingSoon(i, now) ? " hot" : ""}`}><TimeLeft item={i} now={now} prefix={false} /><b className="amt">{formatMoney(i.currentMinor ?? i.openingMinor)}</b></span>
              </button></li>
            ))}
          </ul>
        </div>
      )}
      {snap.event.donations.enabled && snap.event.donations.open && (
        <button type="button" className="rail-give" onClick={() => nav.tab("give")}><IHeart size={22} /><span><b>Give to a cause</b><small>{snap.event.donations.recipients.map(r => r.name).join(" · ")}</small></span><IChevR size={18} /></button>
      )}
    </aside>
  );
}
