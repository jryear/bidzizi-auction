"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, errorText, fmtTime, newId } from "../../lib/api";
import { formatMoney } from "../../lib/money";
import { TEMPLATES, THEMES, type Template } from "../../lib/templates";
import { IChevL, IClose, ICopy, IPlus } from "../../lib/icons";
import type { Item as PItem } from "../e/[code]/model";
import { ItemCard } from "../e/[code]/ui";
import { SUGGESTED_NAMES, type EventCard } from "./data";
import { Status, Switch } from "./kit";

const pad = (n: number) => String(n).padStart(2, "0");
function nextWeekDate() { const d = new Date(Date.now() + 7 * 86400_000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

/** A template, previewed with the attendee's real card component in the template's theme. */
export function TemplatePreview({ t }: { t: Template }) {
  const now = Date.now();
  const items: PItem[] = (t.items.length ? t.items : [{ title: "Your first item", short: "Add a photo and a starting bid", openingMinor: 10_000, category: "" }]).slice(0, 2).map((i, n) => ({
    id: `${t.id}-${n}`, position: n, title: i.title, short: i.short, description: "", category: i.category, donor: "", imageUrl: null, openingMinor: i.openingMinor,
    opensAt: new Date(now - 60_000).toISOString(), closesAt: new Date(now + t.durationHours * 3600_000).toISOString(), phase: "open", currentMinor: null, bidCount: 0,
    leader: null, minimumNextMinor: i.openingMinor, incrementMinor: 2500, watching: false, myHighestMinor: null, myBidCount: 0, award: null,
  }));
  const theme = THEMES.find(x => x.id === t.theme)!;
  return (
    <div className="tpl-phone" aria-hidden="true" inert>
      <div className="pa is-canvas tpl-screen" data-theme={t.theme}>
        <div className="tpl-pass" style={{ background: theme.ink }}><span style={{ background: theme.accent }} /><b>Your business</b></div>
        <div className="tpl-head"><small>{t.name}</small><b>Items</b></div>
        <div className="cards">{items.map(i => <ItemCard key={i.id} item={i} now={now} canWatch={false} />)}</div>
      </div>
    </div>
  );
}

export function NewEvent({ events, onClose, onCreated, startWith }: { events: EventCard[]; onClose: () => void; onCreated: (id: string) => void; startWith?: EventCard }) {
  const ref = useRef<HTMLDialogElement>(null);
  const request = useRef(newId());
  const [step, setStep] = useState<"pick" | "details">(startWith ? "details" : "pick");
  const [template, setTemplate] = useState<Template | null>(null);
  const [source, setSource] = useState<EventCard | null>(startWith ?? null);
  const [name, setName] = useState(startWith ? startWith.name : "");
  const [practice, setPractice] = useState(false);
  const [date, setDate] = useState(nextWeekDate()), [time, setTime] = useState("18:00"), [hours, setHours] = useState(3);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const start = useMemo(() => new Date(`${date}T${time}`), [date, time]);
  const end = new Date(start.getTime() + hours * 3600_000);
  const past = events.slice(0, 6);

  function pick(t: Template) { setTemplate(t); setSource(null); setName(SUGGESTED_NAMES[t.id] ?? ""); setHours(t.durationHours); setStep("details"); setError(""); request.current = newId(); }
  function pickPast(e: EventCard) { setSource(e); setTemplate(null); setName(e.name); setHours(Math.max(1, Math.round((new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime()) / 3600_000))); setStep("details"); setError(""); request.current = newId(); }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Give your event a name."); return; }
    if (Number.isNaN(start.getTime())) { setError("Choose a date and start time."); return; }
    setBusy(true); setError("");
    const r = source
      ? await api("POST", `/api/v1/host/events/${source.id}/duplicate`, { requestId: request.current, name, startsAt: start.toISOString() }).catch(() => null)
      : await api("POST", "/api/v1/host/events", { requestId: request.current, template: template?.id ?? "blank", name, startsAt: start.toISOString(), endsAt: end.toISOString(), timezone: tz, isPractice: practice }).catch(() => null);
    if (r?.ok) onCreated(r.data.id);
    else { setBusy(false); setError(r ? errorText(r) : "Connection lost. Try again. It won't be created twice."); }
  }

  return (
    <dialog ref={ref} className="sx-dialog new-event" aria-labelledby="ne-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault(); }}>
      <div className="ne-head">
        {step === "details" && !startWith ? <button type="button" className="sx-btn ghost" onClick={() => setStep("pick")}><IChevL size={18} />Templates</button> : <span />}
        <button type="button" className="sx-icon-btn" aria-label="Close" onClick={() => ref.current?.close()}><IClose size={22} /></button>
      </div>
      {step === "pick" ? (
        <div className="ne-body">
          <h2 id="ne-title">Start a new event</h2>
          <p className="sx-muted">Pick a starting point. Everything is editable on the next screen, right on the phone attendees will see.</p>
          <div className="tpl-grid">
            {TEMPLATES.map(t => (
              <article key={t.id} className={`tpl t-${t.theme}`}>
                <TemplatePreview t={t} />
                <div className="tpl-meta">
                  <b>{t.name}</b>
                  <span>{t.blurb}</span>
                  <small>{t.items.length ? `${t.items.length} sample item${t.items.length > 1 ? "s" : ""}` : "No sample items"} · {t.durationHours}h{t.donations ? " · donations on" : ""}</small>
                </div>
                <button type="button" className="tpl-hit" onClick={() => pick(t)} aria-label={`Use the ${t.name} template`} />
              </article>
            ))}
          </div>
          {past.length > 0 && (
            <section className="ne-past">
              <h3>Or start from a past event</h3>
              <p className="sx-muted">Copies the setup and items. Participants, bids and results stay with the original.</p>
              <div className="past-list">
                {past.map(e => (
                  <button type="button" key={e.id} className="past" onClick={() => pickPast(e)}>
                    <span className="past-thumb">{e.coverUrl ? <img src={e.coverUrl} alt="" /> : <span>{e.name.slice(0, 1)}</span>}</span>
                    <span className="past-t"><b>{e.name}</b><small>{fmtTime(e.startsAt)} · {e.itemCount} item{e.itemCount === 1 ? "" : "s"}</small></span>
                    <ICopy size={18} />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <form className="ne-body ne-details" onSubmit={create}>
          <div className="ne-split">
            <div className="ne-form">
              <span className="sx-eyebrow">{source ? `Copy of ${source.name}` : template?.name ?? "New event"}</span>
              <h2 id="ne-title">Name it and pick a time</h2>
              <label className="sx-field big"><span className="sx-label">Event name</span>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Holiday Trade Show" autoFocus onFocus={e => e.target.select()} /></label>
              <div className="ne-when">
                <label className="sx-field"><span className="sx-label">Date</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
                <label className="sx-field"><span className="sx-label">Bidding opens</span><input type="time" value={time} step={900} onChange={e => setTime(e.target.value)} /></label>
              </div>
              {!source && (
                <div className="sx-field"><span className="sx-label">Bidding runs for</span>
                  <div className="dur" role="radiogroup" aria-label="Duration">
                    {[1, 2, 3, 4, 6, 8].map(h => <button type="button" key={h} role="radio" aria-checked={hours === h} className={hours === h ? "on" : ""} onClick={() => setHours(h)}>{h}h</button>)}
                  </div>
                </div>
              )}
              {!source && <Switch on={practice} onChange={setPractice} label="Practice event" sub="For rehearsals. You can reset it to a clean slate any time, and it never takes the spot of your real event." />}
              <p className="ne-summary">{Number.isNaN(start.getTime()) ? "Choose a date and time" : <>Bidding <b>{start.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</b> to <b>{end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</b>{source ? " (same length as the original)" : ""}. You can change this any time.</>}</p>
              {error && <p className="sx-error" role="alert">{error}</p>}
              <button className="sx-btn primary lg" disabled={busy}>{busy ? "Creating…" : <><IPlus size={18} />Create and open the editor</>}</button>
              <p className="sx-fine">It starts as a draft. Nobody can see it until you go live.</p>
            </div>
            <div className="ne-preview">
              {template ? <TemplatePreview t={template} /> : source && (
                <div className="past-card">{source.coverUrl ? <img src={source.coverUrl} alt="" /> : null}<div><Status stage={source.stage} /><b>{source.name}</b><small>{source.itemCount} item{source.itemCount === 1 ? "" : "s"} copied. Guests and bids aren’t copied.</small></div></div>
              )}
              {template && template.items.length > 0 && <ul className="ne-items">{template.items.map(i => <li key={i.title}><span>{i.title}</span><b>{formatMoney(i.openingMinor)}</b></li>)}</ul>}
            </div>
          </div>
        </form>
      )}
    </dialog>
  );
}
