"use client";
// Results: wrap-up as a checklist. Confirm each winner, hand the item over, process donations, export.
import { useEffect, useState, type CSSProperties } from "react";
import { api, errorText, fmtClock, fmtTime } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { ICheck, IChevD, IDownload, IHeart, ITrophy } from "../../../lib/icons";
import { ItemArt } from "../../e/[code]/ui";
import type { Data, Item } from "../data";
import { Ring } from "../kit";

type Ctx = { data: Data; reload: () => Promise<void>; flash: (t: string, tone?: "ink" | "red" | "green") => void };

export function ResultsBoard({ ctx }: { ctx: Ctx }) {
  const { data } = ctx, e = data.event;
  const items = data.items.filter(i => i.ready || i.bidCount);
  const decide = items.filter(i => i.phase === "closed" && !i.award);
  const handover = items.filter(i => i.award?.status === "assigned");
  const done = items.filter(i => i.award?.status === "fulfilled" || i.award?.status === "no_winner");
  const open = items.filter(i => i.phase !== "closed");
  const pledges = data.pledges, unprocessed = pledges.filter(p => !p.processedAt);
  // Progress counts only what can be wrapped up now: closed items and donations. Open items join as they close.
  const closed = items.filter(i => i.phase === "closed");
  const total = closed.length + pledges.length, finished = done.length + (pledges.length - unprocessed.length);
  const allDone = total > 0 && finished === total;
  const celebrate = allDone && !open.length;
  const sold = items.filter(i => i.award && i.award.status !== "no_winner").reduce((s, i) => s + (i.award?.amountMinor ?? 0), 0);
  const given = pledges.reduce((s, p) => s + p.amountMinor, 0);
  const [showDone, setShowDone] = useState(false);

  return (
    <div className="results">
      <section className={`wrap-hero${celebrate ? " all" : ""}`}>
        <Ring done={finished} total={total} size={92} stroke={8} />
        <div className="wh-t">
          <h2>{allDone && !open.length ? "Everything's wrapped up" : total - finished > 0 ? `${total - finished} thing${total - finished === 1 ? "" : "s"} to wrap up` : open.length ? "Bidding is still going" : "Nothing to wrap up yet"}</h2>
          {allDone && !open.length ? <p>Winners confirmed, items handed over, donations processed.</p> : open.length ? <p>{open.length} item{open.length === 1 ? " is" : "s are"} still open. They appear here as they close.</p> : null}
        </div>
        <div className="wh-nums">
          <div><span>Items sold</span><b>{formatMoney(sold)}</b></div>
          <div><span>Donated</span><b>{formatMoney(given)}</b></div>
        </div>
        {celebrate && <div className="wh-confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ "--x": `${(i * 41) % 100}%`, "--d": `${(i % 6) * 0.1}s`, "--c": ["#F2B632", "#2338C7", "#12724A", "#C93A1B"][i % 4] } as CSSProperties} />)}</div>}
      </section>

      <div className="wrap-cols">
        <div className="wrap-main">
          <Section n={1} title="Confirm winners" count={decide.length} doneText={items.some(i => i.phase === "closed") ? "Every closed item has a decision." : "Items appear here as they close."}>
            {decide.map(i => <DecideCard key={i.id} ctx={ctx} item={i} />)}
          </Section>
          <Section n={2} title="Hand over" count={handover.length} doneText="Nothing waiting to be handed over.">
            {handover.map(i => <HandoverCard key={i.id} ctx={ctx} item={i} />)}
          </Section>
          {open.length > 0 && (
            <section className="wrap-sec muted">
              <h3><span className="ws-n open" />Still open <em>{open.length}</em></h3>
              <ul className="open-list">{open.map(i => <li key={i.id}><span>{i.title}</span><small>{i.bidCount ? `${formatMoney(i.currentMinor!)} · ${i.leader?.business}` : "No bids"} · closes {fmtClock(i.effectiveClosesAt, e.timezone)}</small></li>)}</ul>
            </section>
          )}
          {done.length > 0 && (
            <section className="wrap-sec">
              <button type="button" className="done-toggle" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}><span className="ws-n ok"><ICheck size={14} /></span>Done <em>{done.length}</em><IChevD size={18} /></button>
              {showDone && <div className="cards-col">{done.map(i => <DoneCard key={i.id} ctx={ctx} item={i} />)}</div>}
            </section>
          )}
        </div>
        <aside className="wrap-side">
          <section className="side-card">
            <h3><IHeart size={18} />Donations <em>{unprocessed.length ? `${unprocessed.length} to process` : pledges.length ? "All processed" : "None"}</em></h3>
            {!pledges.length ? <p className="sx-muted">{e.donationsEnabled ? "No donations yet." : "Donations are off for this event."}</p> : (
              <ul className="pledges">
                {pledges.map(p => <Pledge key={p.id} ctx={ctx} p={p} />)}
              </ul>
            )}
          </section>
          <section className="side-card">
            <h3><IDownload size={18} />Exports</h3>
            <div className="exports">
              <a className="sx-btn block" href={`/api/v1/host/events/${e.id}/export/results`}><IDownload size={16} />Winners</a>
              <a className="sx-btn block" href={`/api/v1/host/events/${e.id}/export/participants`}><IDownload size={16} />Participants</a>
              <a className="sx-btn block" href={`/api/v1/host/events/${e.id}/export/donations`}><IDownload size={16} />Donations</a>
            </div>
          </section>
          <p className="sx-fine">Guests can see their results until {fmtTime(e.accessEndsAt, e.timezone)}.</p>
        </aside>
      </div>
    </div>
  );
}

function Section({ n, title, count, doneText, children }: { n: number; title: string; count: number; doneText: string; children: React.ReactNode }) {
  return (
    <section className={`wrap-sec${count ? "" : " clear"}`}>
      <h3><span className={`ws-n${count ? "" : " ok"}`}>{count ? n : <ICheck size={14} />}</span>{title}{count > 1 && <em>{count}</em>}</h3>
      {count ? <div className="cards-col">{children}</div> : <p className="ws-clear">{doneText}</p>}
    </section>
  );
}

function useAward(ctx: Ctx, item: Item) {
  const [busy, setBusy] = useState(false);
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    const r = await api("POST", `/api/v1/host/items/${item.id}/award`, { action, revision: item.award?.revision ?? 0, ...extra }).catch(() => null);
    setBusy(false);
    if (!r) ctx.flash("Connection lost. Try again. It's safe to repeat.", "red");
    else if (!r.ok) ctx.flash(errorText(r), "red");
    else ctx.flash({ assign: "Winner confirmed. They'll see it on their phone.", no_winner: "Marked as no winner", fulfilled: "Handed over", unfulfilled: "Moved back to hand over", notes: "Note saved" }[action] ?? "Saved", "green");
    await ctx.reload();
  };
  return { busy, act };
}

function Thumb({ item }: { item: Item }) {
  return <span className="rc-thumb">{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <ItemArt item={item} size="sm" />}</span>;
}

function DecideCard({ ctx, item }: { ctx: Ctx; item: Item }) {
  const { busy, act } = useAward(ctx, item);
  const [choosing, setChoosing] = useState(false);
  const top = item.bids[0];
  return (
    <article className="rc decide">
      <div className="rc-row">
        <Thumb item={item} />
        <div className="rc-t"><b>{item.title}</b>
          {top ? <span className="rc-win"><ITrophy size={15} /><b>{top.business}</b> · {top.name} · <b>{formatMoney(top.amountMinor)}</b></span> : <span className="rc-win none">No bids</span>}</div>
        <div className="rc-acts">
          {top ? <>
            <button type="button" className="sx-btn primary" disabled={busy} onClick={() => act("assign")}><ICheck size={16} />Confirm winner</button>
            <button type="button" className="sx-btn ghost sm" onClick={() => setChoosing(!choosing)}>Pick another bid</button>
          </> : <button type="button" className="sx-btn" disabled={busy} onClick={() => act("no_winner")}>Mark no winner</button>}
        </div>
      </div>
      {choosing && <ChooseBid ctx={ctx} item={item} busy={busy} act={act} onCancel={() => setChoosing(false)} />}
    </article>
  );
}

function ChooseBid({ item, busy, act, onCancel }: { ctx: Ctx; item: Item; busy: boolean; act: (a: string, x?: Record<string, unknown>) => void; onCancel: () => void }) {
  return (
    <div className="choose">
      <p>Award a different bid, for example if the top bidder can’t take the item.</p>
      <ol>{item.bids.map(b => (
        <li key={b.id}><span><b>{b.business}</b> · {b.name}</span><span className="amt">{formatMoney(b.amountMinor)}</span>
          <button type="button" className="sx-btn sm" disabled={busy || b.id === item.award?.bidId} onClick={() => act("assign", { bidId: b.id })}>{b.id === item.award?.bidId ? "Current" : "Award"}</button></li>
      ))}</ol>
      <div className="choose-foot"><button type="button" className="sx-btn ghost sm" disabled={busy} onClick={() => act("no_winner")}>No winner</button><button type="button" className="sx-btn ghost sm" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

function HandoverCard({ ctx, item }: { ctx: Ctx; item: Item }) {
  const { busy, act } = useAward(ctx, item);
  const [notes, setNotes] = useState(item.award?.notes ?? ""), [choosing, setChoosing] = useState(false);
  useEffect(() => { setNotes(item.award?.notes ?? ""); }, [item.award?.revision, item.award?.notes]);
  const w = item.bids.find(b => b.id === item.award?.bidId);
  return (
    <article className="rc handover">
      <div className="rc-row">
        <Thumb item={item} />
        <div className="rc-t"><b>{item.title}</b>
          {w && <span className="rc-win yours"><ITrophy size={15} /><b>{w.business}</b> · {w.name} · <b>{formatMoney(w.amountMinor)}</b></span>}</div>
        <div className="rc-acts"><button type="button" className="sx-btn primary" disabled={busy} onClick={() => act("fulfilled")}><ICheck size={16} />Handed over</button>
          <button type="button" className="sx-btn ghost sm" onClick={() => setChoosing(!choosing)}>Change winner</button></div>
      </div>
      <div className="rc-notes">
        <input value={notes} onChange={x => setNotes(x.target.value)} placeholder="Add a note (optional)" aria-label={`Notes for ${item.title}`} />
        <button type="button" className="sx-btn sm" disabled={busy || notes === (item.award?.notes ?? "")} onClick={() => act("notes", { notes })}>Save note</button>
      </div>
      {choosing && <ChooseBid ctx={ctx} item={item} busy={busy} act={act} onCancel={() => setChoosing(false)} />}
    </article>
  );
}

function DoneCard({ ctx, item }: { ctx: Ctx; item: Item }) {
  const { busy, act } = useAward(ctx, item);
  const w = item.bids.find(b => b.id === item.award?.bidId);
  return (
    <article className="rc done">
      <div className="rc-row">
        <Thumb item={item} />
        <div className="rc-t"><b>{item.title}</b><span className="rc-win">{item.award?.status === "no_winner" ? "No winner" : w ? <>{w.business} · {formatMoney(w.amountMinor)} · handed over</> : "Handed over"}{item.award?.notes ? ` · “${item.award.notes}”` : ""}</span></div>
        {item.award?.status === "fulfilled" && <button type="button" className="sx-btn ghost sm" disabled={busy} onClick={() => act("unfulfilled")}>Undo</button>}
      </div>
    </article>
  );
}

function Pledge({ ctx, p }: { ctx: Ctx; p: Data["pledges"][number] }) {
  const [busy, setBusy] = useState(false);
  const set = async (processed: boolean) => {
    setBusy(true);
    const r = await api("PATCH", `/api/v1/host/events/${ctx.data.event.id}/pledges/${p.id}`, { processed }).catch(() => null);
    setBusy(false);
    if (!r?.ok) ctx.flash(r ? errorText(r) : "Connection lost.", "red");
    await ctx.reload();
  };
  return (
    <li className={p.processedAt ? "ok" : ""}>
      <button type="button" role="checkbox" aria-checked={Boolean(p.processedAt)} className="pl-check" disabled={busy} onClick={() => set(!p.processedAt)} aria-label={`Processed: ${p.business} to ${p.recipientName}`}>{p.processedAt && <ICheck size={14} />}</button>
      <span className="pl-t"><b>{p.business}</b><small>{p.name} → {p.recipientName}</small></span>
      <b className="amt">{formatMoney(p.amountMinor)}</b>
    </li>
  );
}
