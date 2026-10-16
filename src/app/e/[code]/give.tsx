"use client";
import { useState, type CSSProperties } from "react";
import { api, errorText, fmtClock, fmtTime, newId, parseDollars } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { ICheck, IChevL, IHeart } from "../../../lib/icons";
import type { PendingBid, Snapshot } from "./model";
import type { Nav } from "./participant";
import type { Alert } from "./moments";
import { EmptyState, Mark } from "./ui";

/** A donation sent without a confirmed answer. Kept on this device so a reload, navigation or "Change" can't turn
 * one intended pledge into two: until the server decides, the only action is to resend this exact request. */
type HeldPledge = { requestId: string; recipientId: string; amountMinor: number };
const heldKey = (code: string) => `bz_pledge_${code}`;
function readHeld(code: string): HeldPledge | null {
  try { const raw = localStorage.getItem(heldKey(code)); const v = raw ? JSON.parse(raw) as HeldPledge : null; return v && typeof v.requestId === "string" ? v : null; } catch { return null; }
}
function writeHeld(code: string, v: HeldPledge | null) {
  try { if (v) localStorage.setItem(heldKey(code), JSON.stringify(v)); else localStorage.removeItem(heldKey(code)); } catch { /* storage unavailable */ }
}
const UNCERTAIN = "We couldn\u2019t confirm it. Tap Confirm again \u2014 it won\u2019t be recorded twice.";

type Props = { snap: Snapshot; now: number; nav: Nav; code: string; stale: boolean; pending: PendingBid[]; onDone: () => void; readOnly?: boolean; notify: (a: Omit<Alert, "id">) => void };

export function Give({ snap, code, nav, onDone, readOnly = false }: Props) {
  const d = snap.event.donations, me = snap.me!;
  const [held, setHeld] = useState<HeldPledge | null>(() => typeof window === "undefined" ? null : readHeld(code));
  const [recipient, setRecipient] = useState(held?.recipientId ?? (d.recipients.length === 1 ? d.recipients[0].id : ""));
  const [amount, setAmount] = useState<number | null>(held?.amountMinor ?? 5000), [custom, setCustom] = useState("");
  const [step, setStep] = useState<"pick" | "review" | "sending" | "done">(held ? "review" : "pick"), [error, setError] = useState(held ? UNCERTAIN : "");
  const [last, setLast] = useState<{ amountMinor: number; recipientName: string } | null>(null);
  const chosen = d.recipients.find(r => r.id === recipient);
  const value = amount ?? parseDollars(custom);
  const hold = (v: HeldPledge | null) => { writeHeld(code, v); setHeld(v); };
  const valid = Boolean(chosen && value && value >= 100 && value <= d.capMinor);
  const given = me.pledges.reduce((s, p) => s + p.amountMinor, 0);

  async function confirm() {
    if (readOnly) return;
    // Saved before sending: if the answer is lost, this exact request is what gets resent.
    const pledge = held ?? { requestId: newId(), recipientId: recipient, amountMinor: value! };
    hold(pledge);
    setStep("sending"); setError("");
    try {
      const r = await api("POST", `/api/v1/e/${code}/pledge`, pledge);
      if (r.ok) { hold(null); setLast({ amountMinor: pledge.amountMinor, recipientName: d.recipients.find(x => x.id === pledge.recipientId)?.name ?? "" }); setStep("done"); onDone(); return; }
      if (r.status >= 500) { setStep("review"); setError(UNCERTAIN); return; }
      hold(null); setStep("review"); setError(errorText(r));
    } catch { setStep("review"); setError("Connection lost. Tap Confirm again \u2014 it won\u2019t be recorded twice."); }
  }

  const head = (
    <section className="page-head give-head">
      <h1>Donate</h1>
      <p className="sub">{given ? <>You&rsquo;ve given <b className="amt">{formatMoney(given)}</b> tonight. Thank you.</> : "Any amount helps."}</p>
    </section>
  );

  if (!d.enabled) return <>{head}<EmptyState icon={<IHeart size={28} />} title="No donations at this event" /></>;
  // An unconfirmed donation still gets resolved after donations close: the server replays a recorded request.
  if (!d.open && !held) return <>{head}<EmptyState icon={<IHeart size={28} />} title="Donations are closed"><p>Thank you to everyone who gave.</p></EmptyState></>;

  if (step === "done" && last) return (
    <div className="give-layout">
      <div className="thanks" role="status">
        <div className="hearts" aria-hidden="true">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--x": `${(i * 37) % 100}%`, "--t": `${(i % 5) * 0.12}s` } as CSSProperties}><IHeart size={16} filled /></i>)}</div>
        <span className="thanks-ic"><IHeart size={40} filled /></span>
        <h2>Thank you, {me.displayName.split(" ")[0]}</h2>
        <p><b className="amt">{formatMoney(last.amountMinor)}</b> to <b>{last.recipientName}</b> is recorded. Staff process donations after the event.</p>
        <div className="row-btns"><button type="button" className="btn quiet" onClick={() => { setStep("pick"); setLast(null); }}>Give again</button><button type="button" className="btn primary" onClick={() => nav.tab("items")}>Back to items</button></div>
      </div>
    </div>
  );

  return (
    <div className="give-layout">
      {head}
      {step === "pick" ? (
        <>
          <section className="give-sec">
            <h2 className="sec-h"><span>1</span>Choose a cause</h2>
            <div className="causes" role="radiogroup" aria-label="Nonprofit">
              {d.recipients.map(r => (
                <button type="button" key={r.id} role="radio" aria-checked={recipient === r.id} className={`cause${recipient === r.id ? " on" : ""}`} onClick={() => setRecipient(r.id)}>
                  <Mark name={r.name} kind="sponsor" url={r.logoUrl} size={48} />
                  <span className="cause-t"><b>{r.name}</b>{r.description && <small>{r.description}</small>}</span>
                  <span className="radio" aria-hidden="true">{recipient === r.id && <ICheck size={16} />}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="give-sec">
            <h2 className="sec-h"><span>2</span>Pick an amount</h2>
            <div className="amounts" role="radiogroup" aria-label="Amount">
              {[2500, 5000, 10000].map(v => <button type="button" key={v} role="radio" aria-checked={amount === v} className={`amt-chip${amount === v ? " on" : ""}`} onClick={() => { setAmount(v); setCustom(""); }}><span className="amt">{formatMoney(v)}</span></button>)}
            </div>
            <label className={`custom${amount === null ? " on" : ""}`}>
              <span className="lbl">Or another amount</span>
              <span className="custom-in"><span className="cur">$</span><input inputMode="decimal" placeholder="0" value={custom} onFocus={() => setAmount(null)} onChange={e => { setCustom(e.target.value.replace(/[^0-9.,]/g, "")); setAmount(null); }} aria-label="Custom amount in dollars" /></span>
            </label>
            {value !== null && value > d.capMinor && <p className="err">The most you can give at once is {formatMoney(d.capMinor)}.</p>}
            {value !== null && value > 0 && value < 100 && <p className="err">The smallest donation is $1.</p>}
          </section>
          <div className="give-foot">
            <button type="button" className="btn primary block lg" disabled={!valid} onClick={() => setStep("review")}>
              {valid ? `Review ${formatMoney(value!)} to ${chosen!.name}` : !chosen ? "Choose a cause" : "Enter an amount"}
            </button>
            {d.deadline && <p className="fine center">Donations close {fmtTime(d.deadline, snap.event.timezone)}.</p>}
          </div>
        </>
      ) : (
        <section className="give-review">
          {!held && <button type="button" className="back-link" disabled={step === "sending"} onClick={() => { setStep("pick"); setError(""); }}><IChevL size={18} />Change</button>}
          <div className="pa-stub give-stub">
            <div className="stub-main"><span className="lbl">Donation to</span><b className="gs-to">{chosen?.name}</b><span className="lbl">From</span><span>{me.businessName} · {me.displayName}</span></div>
            <div className="stub-side"><span className="lbl">Amount</span><b className="n amt">{formatMoney(value!)}</b></div>
          </div>
          <ul className="commit-box plain">
            <li>Recorded now, at {fmtClock(new Date())}. Event staff process donations after the event.</li>
            <li className="note">Tapping twice, or losing your connection, never records it twice.</li>
          </ul>
          {error && <p className="notice-err" role="alert">{error}</p>}
          <button type="button" className="btn primary block lg" disabled={step === "sending"} onClick={confirm}>{step === "sending" ? <><span className="spinner" aria-hidden="true" />Recording…</> : `Confirm ${formatMoney(value!)}`}</button>
        </section>
      )}
    </div>
  );
}
