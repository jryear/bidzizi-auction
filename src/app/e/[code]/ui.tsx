"use client";
import { photoStyle } from "../../../lib/photo";
// Presentational pieces shared by the attendee app and the Studio canvas. The canvas renders these same components with an
// edit context, so what a host edits is literally what attendees see.
import { usePhotoUpload } from "../../../lib/use-photo-upload";
import { headline } from "../../../lib/display";
import { createContext, useContext, useEffect, useId, useRef, useState, ViewTransition, type CSSProperties, type ReactNode } from "react";
import { fmtClock, fmtTime, initials } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { IBookmark, IChevR, IClock, IExternal, IPhoto, IUpload } from "../../../lib/icons";
import { closingSoon, countdown, lotNo, shown, standing, type EventInfo, type Item, type Standing } from "./model";

// ---------------------------------------------------------------- edit context (Studio canvas only)
export type EditApi = {
  selected: string | null;
  decorateItem?: (item: Item, content: ReactNode) => ReactNode;
  catalogFooter?: ReactNode;
  select: (key: string) => void;
  commit: (key: string, field: string, value: string) => Promise<boolean>;
  photo: (key: string, file: File, current: () => boolean) => Promise<boolean>;
};
export const EditCtx = createContext<EditApi | null>(null);
export const useEdit = () => useContext(EditCtx);

/** Text that is plain for attendees and edits in place on the Studio canvas. */
export function Ed({ k, field, value, placeholder, as: Tag = "span", className, multiline = false, max }: {
  k: string; field: string; value: string; placeholder?: string; as?: "span" | "h1" | "h2" | "h3" | "p" | "b"; className?: string; multiline?: boolean; max?: number;
}) {
  const edit = useEdit();
  const ref = useRef<HTMLElement>(null);
  const editId = useId(), dirty = useRef(false), generation = useRef(0);
  const acknowledged = useRef(value), sent = useRef<string | null>(null), idle = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mark = (isDirty: boolean) => {
    dirty.current = isDirty;
    dispatchEvent(new CustomEvent("bz:editing", { detail: { field: editId, dirty: isDirty } }));
  };
  // A server refresh must not erase newer text or a failed draft, even after blur.
  useEffect(() => {
    if (dirty.current) return;
    acknowledged.current = value;
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerText !== value) el.innerText = value;
  }, [value, edit]);
  useEffect(() => () => {
    clearTimeout(idle.current);
    dispatchEvent(new CustomEvent("bz:editing", { detail: { field: editId, dirty: false } }));
  }, [editId]);
  if (!edit) return value ? <Tag className={className}>{value}</Tag> : null;
  const clean = (el: HTMLElement) => (el.innerText ?? "").replace(/ /g, " ").replace(multiline ? /\n{3,}/g : /\s*\n\s*/g, multiline ? "\n\n" : " ").trim().slice(0, max ?? 5000);
  // Only acknowledge the exact generation saved; later typing stays dirty.
  const save = (el: HTMLElement, leaving: boolean) => {
    clearTimeout(idle.current);
    let next = clean(el);
    if (!next && (field === "title" || field === "name")) {
      if (!leaving) return;
      next = value; el.innerText = value; generation.current++;
    }
    if (next === (sent.current ?? acknowledged.current)) { if (sent.current === null) mark(false); return; }
    const version = generation.current;
    sent.current = next;
    void edit.commit(k, field, next).catch(() => false).then(ok => {
      if (ok) acknowledged.current = next;
      if (sent.current === next) sent.current = null;
      if (generation.current === version) mark(!ok);
    });
  };
  return (
    <Tag ref={ref as never} className={`${className ?? ""} ed`} contentEditable="plaintext-only" suppressContentEditableWarning spellCheck
      data-placeholder={placeholder} aria-label={placeholder ?? field} role="textbox" aria-multiline={multiline}
      onFocus={() => edit.select(k)} onClick={e => e.stopPropagation()}
      onBlur={e => save(e.currentTarget, true)}
      onInput={e => { const el = e.currentTarget; generation.current++; mark(true); clearTimeout(idle.current); idle.current = setTimeout(() => save(el, false), 1200); }}
      onKeyDown={e => {
        if (e.key === "Escape") { e.currentTarget.innerText = value; e.currentTarget.blur(); }
        if (e.key === "Enter" && !multiline) { e.preventDefault(); e.currentTarget.blur(); }
      }} />
  );
}

/** A tap target that opens something for attendees, and selects for editing on the canvas. */
export function Tap({ onOpen, k, className, label, children, style }: { onOpen?: () => void; k?: string; className?: string; label?: string; children?: ReactNode; style?: CSSProperties }) {
  const edit = useEdit();
  if (edit) {
    const on = k !== undefined && edit.selected === k;
    return <div className={`${className ?? ""} tap-ed${on ? " is-sel" : ""}`} style={style} onClick={() => k && edit.select(k)} aria-label={label}>{children}</div>;
  }
  return <button type="button" className={className} style={style} onClick={onOpen} aria-label={label}>{children}</button>;
}

/** A photo slot. On the canvas it accepts a click or a dropped file. */
export function Photo({ k, url, alt = "", className, children, vt, focal }: { k?: string; url: string | null; alt?: string; className?: string; children?: ReactNode; vt?: string; focal?: import("../../../lib/photo").FocalPoint }) {
  const edit = useEdit();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const upload = usePhotoUpload(`${k}:${url}`, (file, current) => edit && k ? edit.photo(k, file, current) : Promise.resolve(false), k);
  const img = url ? <img style={photoStyle(focal)} src={url} alt={alt} loading="lazy" draggable={false} /> : null;
  const control = edit && k ? <button type="button" data-edit-chrome className={`ph-drop${className === "ehero-media" ? " cover-ph" : ""}${url ? "" : " ph-none"}${over ? " over" : ""}`} onClick={e => { e.stopPropagation(); edit.select(k); input.current?.click(); }}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); upload.pick(e.dataTransfer.files?.[0]); }}
      onPaste={e => { const f = [...e.clipboardData.files].find(f => f.type.startsWith("image/")); if (f) { e.preventDefault(); upload.pick(f); } }}>
      <span><IUpload size={18} />{upload.busy ? "Uploading…" : url ? "Replace photo" : "Add a photo"}</span>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={e => { upload.pick(e.target.files?.[0]); e.target.value = ""; }} />
    </button> : null;
  const body = <div className={className} aria-busy={upload.busy || undefined}>{img ?? children}{className !== "ehero-media" && control}</div>;
  return <>{vt && !edit ? <ViewTransition name={vt} share="morph">{body}</ViewTransition> : body}
    {className === "ehero-media" && control}
    {edit && upload.error && <div data-edit-chrome className="photo-error" role="alert"><span>{upload.error}</span><button type="button" onClick={upload.retry}>Try again</button></div>}</>;
}

// ---------------------------------------------------------------- atoms
const HUES = ["#2B3A67", "#1F4D3F", "#6B2D3C", "#7A4B12", "#33415C", "#5B3A6E", "#264E5A"];
function hue(text: string) { let h = 0; for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; }

/** Designed stand-in for an item without a photo: a catalogue plate, not an empty box. */
export function ItemArt({ item, size = "lg" }: { item: Pick<Item, "position" | "title" | "category">; size?: "lg" | "sm" }) {
  return (
    <div className={`art art-${size}`} style={{ "--c": hue(item.title + item.category) } as CSSProperties} aria-hidden="true">
      <span className="art-no">{lotNo(item)}</span>
    </div>
  );
}

export function Mark({ name, kind = "biz", size = 32, url, you = false }: { name: string; kind?: "biz" | "sponsor"; size?: number; url?: string | null; you?: boolean }) {
  return (
    <span className={`mark ${kind === "sponsor" ? "sq" : "ci"}${you ? " you" : ""}`} style={{ "--s": `${size}px`, "--mc": you ? undefined : hue(name) } as CSSProperties} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initials(name)}
    </span>
  );
}

/** Money that rolls when it changes, so a live update reads as movement, not a jump. */
export function Amount({ minor, className = "", stale = false }: { minor: number; className?: string; stale?: boolean }) {
  const prev = useRef(minor);
  const [roll, setRoll] = useState<{ n: number; dir: "up" | "down" } | null>(null);
  useEffect(() => {
    if (prev.current !== minor) { setRoll(r => ({ n: (r?.n ?? 0) + 1, dir: minor > prev.current ? "up" : "down" })); prev.current = minor; }
  }, [minor]);
  return <span key={roll?.n ?? 0} className={`amt ${className}${stale ? " stale" : ""}`} data-roll={roll?.dir}>{formatMoney(minor)}</span>;
}

export function Pill({ s, small = false }: { s: Standing; small?: boolean }) {
  if (s.tone === "none") return null;
  return <span className={`pill t-${s.tone}${small ? " sm" : ""}`}><i aria-hidden="true" />{s.label}</span>;
}

export function LotTab({ item, size = "md" }: { item: Pick<Item, "position">; size?: "sm" | "md" | "lg" }) {
  return <span className={`lot-tab ${size}`}><small>Item</small>{lotNo(item)}</span>;
}

export function Watch({ on, onToggle, size = "md", disabled }: { on: boolean; onToggle?: () => void; size?: "md" | "lg"; disabled?: boolean }) {
  const [pop, setPop] = useState(0);
  return (
    <button type="button" className={`watch ${size}${on ? " on" : ""}`} aria-pressed={on} aria-label={on ? "Watching. Tap to stop watching" : "Watch this item"}
      disabled={disabled} onClick={e => { e.stopPropagation(); setPop(p => p + 1); onToggle?.(); }}>
      <span key={pop} className={pop ? "pop" : ""}><IBookmark size={size === "lg" ? 22 : 20} filled={on} /></span>
    </button>
  );
}

/** Time left, from server time. Turns urgent inside the last minute. */
export function TimeLeft({ item, now, prefix = true }: { item: Item; now: number; prefix?: boolean }) {
  if (item.phase === "scheduled") return <span className="tl">Opens {fmtClock(item.opensAt)}</span>;
  if (item.phase === "closed") return <span className="tl">Closed {fmtClock(item.closesAt)}</span>;
  const soon = closingSoon(item, now), left = new Date(item.closesAt).getTime() - now;
  return <span className={`tl${soon ? " soon" : ""}${left <= 60_000 ? " urgent" : ""}`}><IClock size={15} />{prefix ? (soon ? "Closing in " : "Ends in ") : ""}<b>{countdown(item.closesAt, now)}</b></span>;
}

// ---------------------------------------------------------------- item card (large) and row (compact)
type CardProps = {
  item: Item; now: number; onOpen?: () => void; onWatch?: (on: boolean) => void; onRebid?: () => void;
  unconfirmed?: boolean; stale?: boolean; canWatch?: boolean; here?: boolean;
};

function LeaderLine({ item }: { item: Item }) {
  if (!item.leader) return <span className="leader none">{item.phase === "scheduled" ? "Not open yet" : "No bids yet"}</span>;
  if (item.leader.isMe) return null; // the band says it
  return <span className="leader"><Mark name={item.leader.business} size={26} /><b>{item.leader.business}</b><span>{item.phase === "closed" ? "had the top bid" : "is leading"}</span></span>;
}

/** A status band only when the participant needs to know something: their standing, or that time is running out. */
export function Band({ item, now, onRebid, unconfirmed }: { item: Item; now: number; onRebid?: () => void; unconfirmed?: boolean }) {
  const s = standing(item, unconfirmed);
  if (s.key === "outbid") return (
    <div className="band t-red">
      <span><b>You&rsquo;ve been outbid</b></span>
      {onRebid && item.minimumNextMinor !== null && <button type="button" className="band-btn" onClick={e => { e.stopPropagation(); e.currentTarget.focus({ preventScroll: true }); onRebid(); }}>Bid {formatMoney(item.minimumNextMinor)}</button>}
    </div>
  );
  if (s.key === "leading") return <div className="band t-green"><span><b>You&rsquo;re leading</b></span>{closingSoon(item, now) && <TimeLeft item={item} now={now} prefix={false} />}</div>;
  if (s.key === "won") return <div className="band t-marigold"><span><b>You won</b> · {formatMoney(item.award?.amountMinor ?? item.currentMinor ?? 0)}</span></div>;
  if (s.key === "awaiting") return <div className="band t-hatch"><span><b>Staff confirming</b> · you had the top bid</span></div>;
  if (s.key === "withdrawn") return <div className="band t-grey"><span><b>Withdrawn</b> by the host</span></div>;
  if (s.key === "voided") return <div className="band t-grey"><span><b>Your bid was removed.</b> You can bid again.</span></div>;
  if (s.key === "unconfirmed") return <div className="band t-dashed"><span><b>Not confirmed.</b> Check it before bidding again.</span></div>;
  if (closingSoon(item, now)) return <div className="band t-amber"><TimeLeft item={item} now={now} /></div>;
  return null;
}

export function ItemCard({ item, now, onOpen, onWatch, onRebid, unconfirmed, stale, canWatch = true, here }: CardProps) {
  const s = standing(item, unconfirmed);
  const head = headline(item, unconfirmed);
  const k = `item:${item.id}`;
  return (
    <article className={`lc tone-${s.tone}${s.mine ? " mine" : ""}${here ? " was-here" : ""}`} data-item={item.id}>
      <Tap className="lc-hit" onOpen={onOpen} k={k} label={`${item.title}, ${formatMoney(headline(item, unconfirmed).amountMinor)}`} />
      <Photo k={k} url={item.imageUrl} focal={item.imageFocal} className="lc-media" vt={`photo-${item.id}`}><ItemArt item={item} /></Photo>
      <LotTab item={item} />
      {canWatch && <Watch on={item.watching} onToggle={() => onWatch?.(!item.watching)} />}
      {item.donor && <span className="provider"><Mark name={item.donor} kind="sponsor" size={24} /><span>{item.donor}</span></span>}
      <div className="lc-body">
        <Ed k={k} field="title" value={item.title} as="h3" className="lc-title" placeholder="Item title" max={200} />
        <Ed k={k} field="short" value={item.short} as="p" className="lc-short" placeholder="One-line summary" max={500} />
      </div>
      <div className="lc-numbers">
        <div className="cn">
          <span className="lbl">{head.label}{item.bidCount ? ` · ${item.bidCount} bid${item.bidCount === 1 ? "" : "s"}` : ""}</span>
          <Amount minor={head.amountMinor} stale={stale} />
        </div>
        {item.phase !== "open" && <div className="cn end"><TimeLeft item={item} now={now} /></div>}
        <div className="leaderrow"><LeaderLine item={item} /></div>
      </div>
      <Band item={item} now={now} onRebid={onRebid} unconfirmed={unconfirmed} />
    </article>
  );
}

/** Compact view: a catalogue index. One line of title, one line of what matters, the amount that leads. */
export function ItemRow({ item, now, onOpen, onWatch, unconfirmed, stale, canWatch = true, here }: CardProps) {
  const s = standing(item, unconfirmed);
  const head = headline(item, unconfirmed);
  const soon = item.phase === "open" && closingSoon(item, now);
  const status = s.mine || s.key === "withdrawn" || s.key === "scheduled" || s.key === "closed" || s.key === "sold" ? s.label
    : item.bidCount ? `${item.bidCount} bid${item.bidCount === 1 ? "" : "s"}` : "No bids yet";
  return (
    <article className={`lr tone-${s.tone}${here ? " was-here" : ""}`} data-item={item.id}>
      <Tap className="lr-hit" onOpen={onOpen} k={`item:${item.id}`} label={`${item.title}, ${head.label} ${formatMoney(head.amountMinor)}`} />
      <span className="lr-no" aria-hidden="true">{lotNo(item)}</span>
      <div className="lr-thumb">{item.imageUrl ? <img style={photoStyle(item.imageFocal)} src={item.imageUrl} alt="" loading="lazy" /> : <ItemArt item={item} size="sm" />}</div>
      <div className="lr-main">
        <h3>{item.title}</h3>
        <p className="lr-meta"><span className={`lr-status s-${s.key}`}>{status}</span>{soon && <span className="lr-soon"><IClock size={13} />{countdown(item.closesAt, now)}</span>}</p>
      </div>
      <div className="lr-end">
        <Amount minor={head.amountMinor} stale={stale} />
        <small>{head.yours ? "yours" : head.label === "Starting bid" ? "start" : head.label === "Final bid" ? "final" : "top bid"}</small>
      </div>
      {canWatch && <Watch on={item.watching} onToggle={() => onWatch?.(!item.watching)} />}
    </article>
  );
}

// ---------------------------------------------------------------- event hero, facts, sponsors
export function EventHero({ event, eyebrow, compact = false, children }: { event: EventInfo; eyebrow?: string; compact?: boolean; children?: ReactNode }) {
  return (
    <header className={`ehero${compact ? " compact" : ""}${event.coverUrl ? "" : " no-cover"}`}>
      <Photo k="event" url={event.coverUrl} focal={event.coverFocal} className="ehero-media"><div className="ehero-art" aria-hidden="true"><span>{initials(event.name)}</span></div></Photo>
      <div className="ehero-text">
        {eyebrow && <span className="ehero-eyebrow">{eyebrow}</span>}
        <Ed k="event" field="name" value={event.name} as="h1" className="ehero-title" placeholder="Event name" max={200} />
        {children}
      </div>
    </header>
  );
}

export function Facts({ event, items }: { event: EventInfo; items?: number }) {
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { timeZone: event.timezone, weekday: "short", month: "short", day: "numeric" });
  // An event ending at midnight belongs to the day it started, not the next one.
  const lastDay = day(new Date(new Date(event.endsAt).getTime() - 1).toISOString());
  const sameDay = day(event.startsAt) === lastDay;
  return (
    <dl className="facts">
      <div><dt>When</dt><dd>{day(event.startsAt)}{sameDay ? "" : ` – ${lastDay}`}</dd></div>
      <div><dt>Bidding</dt><dd>{fmtClock(event.startsAt, event.timezone)} – {fmtClock(event.endsAt, event.timezone)}</dd></div>
      {items !== undefined ? <div><dt>Items</dt><dd>{items}</dd></div> : event.venue ? <div><dt>Where</dt><dd>{event.venue}</dd></div> : null}
    </dl>
  );
}

export function SponsorGrid({ sponsors, title = "Thanks to our sponsors" }: { sponsors: EventInfo["sponsors"]; title?: string }) {
  if (!sponsors.length) return null;
  return (
    <section className="pa-sponsors">
      <span className="lbl">{title}</span>
      <ul>{sponsors.map(s => <li key={s.name}>{s.url
        ? <a className="sp-link" href={s.url} target="_blank" rel="noopener noreferrer"><Mark name={s.name} kind="sponsor" url={s.logoUrl} size={40} /><span>{s.name}</span><IExternal size={14} /></a>
        : <><Mark name={s.name} kind="sponsor" url={s.logoUrl} size={40} /><span>{s.name}</span></>}</li>)}</ul>
    </section>
  );
}

export function LinkRow({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub?: string; onClick: () => void }) {
  return <button type="button" className="linkrow" onClick={onClick}>{icon}<span className="lr-t"><b>{title}</b>{sub && <small>{sub}</small>}</span><IChevR size={18} /></button>;
}

export function EmptyState({ icon = <IPhoto size={28} />, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return <div className="pa-empty"><span className="empty-ic">{icon}</span><h2>{title}</h2>{children}</div>;
}
