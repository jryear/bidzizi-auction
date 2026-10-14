"use client";
import { ViewTransition, type ReactNode } from "react";
import { accentVars } from "../../../lib/color";
import { fmtClock, initials } from "../../../lib/api";
import { IBookmark, IChevL, IGrid, IHeart, IInfo, ITicket, IWifiOff } from "../../../lib/icons";
import type { PendingBid, Snapshot } from "./model";
import type { Nav, Section } from "./participant";
import type { Alert } from "./moments";
import { Catalog } from "./catalog";
import { ItemPage } from "./item";
import { MyBids } from "./mine";
import { EventPage } from "./event";
import { Give } from "./give";
import { Join, PreviewBanner } from "./join";
import { Mark } from "./ui";

const SECTIONS: Section[] = ["items", "watching", "mine", "event", "give"];

export function GuestShell({ snap, code, route, nav, now, stale = false, pending = null, cameFrom = null, asOf = null, editor = false, join = false, onDone, notify, children }: {
  snap: Snapshot; code: string; route: { s: Section; i: string | null }; nav: Nav; now: number; stale?: boolean; pending?: PendingBid | null;
  cameFrom?: string | null; asOf?: number | null; editor?: boolean; join?: boolean; onDone: () => Promise<boolean> | void;
  notify: (a: Omit<Alert, "id">) => void; children?: ReactNode;
}) {
  if (join || !snap.me) return <Join snap={editor ? { ...snap, preview: false } : snap} code={code} onJoined={onDone} readOnly={editor} preview={snap.preview ? <div data-edit-chrome>{editor ? <div className="preview-banner" role="status">Preview. Actions are off while you edit.</div> : <PreviewBanner />}</div> : null} />;
  const me = snap.me, e = snap.event;
  const item = route.i ? snap.items.find(i => i.id === route.i) ?? null : null;
  const outbid = snap.items.filter(i => i.phase === "open" && i.myBidCount > 0 && !i.leader?.isMe).length;
  const wonCount = snap.items.filter(i => i.award?.isMe).length;
  const tabs = SECTIONS.filter(s => s !== "give" || e.donations.enabled);

  const screenKey = item ? `item-${item.id}` : route.s;
  const common = { snap, now, nav, code, stale, pending };

  const navEl = (where: "bottom" | "top") => (
    <nav className={`pa-nav ${where}`} aria-label="Sections">
      <div className="pa-nav-in" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map(t => {
          const on = route.s === t && !item;
          const Icon = { items: IGrid, watching: IBookmark, mine: ITicket, event: IInfo, give: IHeart }[t];
          const count = t === "mine" ? outbid || (wonCount ? wonCount : 0) : t === "watching" ? snap.items.filter(i => i.watching).length : 0;
          return (
            <button key={t} type="button" className={`pa-tab${on ? " on" : ""}`} aria-current={on ? "page" : undefined} onClick={() => nav.tab(t)}>
              <Icon size={21} />
              <span>{{ items: "Items", watching: "Watching", mine: "My bids", event: "Event", give: "Donate" }[t]}</span>
              {t === "mine" && count > 0 && <em className={`dot${outbid ? "" : " won"}`} aria-label={outbid ? `${outbid} outbid` : `${wonCount} won`}>{count}</em>}
              {t === "watching" && count > 0 && <em className="dot quiet" aria-hidden="true">{count}</em>}
            </button>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className={`pa${editor ? " is-canvas" : ""}`} data-guest-shell data-theme={e.theme} style={accentVars(e.accentColor)} data-screen={item ? "item" : route.s}>
      <a className="skip" href="#main">Skip to content</a>
      {item ? (
        <header className="pa-topbar" style={{ viewTransitionName: "pa-head" }}>
          <button type="button" className="back" onClick={nav.back}><IChevL size={22} />{{ items: "Items", watching: "Watching", mine: "My bids", event: "Event", give: "Donate" }[route.s]}</button>
          <span className="wordmark">{e.name}</span>
          <span className="chip-pass" title={`Bidding as ${me.businessName}`}><Mark name={me.businessName} you size={28} /><span>{me.businessName}</span></span>
        </header>
      ) : (
        <header className="pa-pass" style={{ viewTransitionName: "pa-head" }}>
          <div className="pass-badge">
            <span className="mark ci you" style={{ "--s": "44px" } as React.CSSProperties} aria-hidden="true">{initials(me.businessName)}</span>
            <span className="pass-text"><b>{me.businessName}</b><small>{me.displayName}</small></span>
          </div>
          <div className="pass-event"><span className="pass-ev-name">{e.name}</span><span className="pass-ev-code">{e.code}</span></div>
          {navEl("top")}
        </header>
      )}
      {stale && (
        <div className="pa-offline" role="status">
          <IWifiOff size={18} />
          <span><b>Reconnecting.</b> Standings as of {asOf ? fmtClock(new Date(asOf)) : "earlier"}. Bids can&rsquo;t be confirmed until you&rsquo;re back.</span>
        </div>
      )}
      {snap.preview && <div data-edit-chrome>{editor ? <div className="preview-banner" role="status">Preview. Actions are off while you edit.</div> : <PreviewBanner />}</div>}

      <main id="main" className="pa-main">
        <ViewTransition key={screenKey} enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", tab: "tab-fade", default: "none" }}
          exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", tab: "tab-fade", default: "none" }} default="none">
          <div className="pa-screen" data-guest-screen={item ? "item" : route.s}>
            {item ? <ItemPage {...common} item={item} /> :
              route.s === "items" ? <Catalog {...common} cameFrom={cameFrom} /> :
              route.s === "watching" ? <Catalog {...common} cameFrom={cameFrom} watching /> :
              route.s === "mine" ? <MyBids {...common} /> :
              route.s === "event" ? <EventPage {...common} /> :
              <Give {...common} readOnly={editor} onDone={onDone} notify={notify} />}
          </div>
        </ViewTransition>
      </main>

      {!item && navEl("bottom")}

      {children}
    </div>
  );
}
