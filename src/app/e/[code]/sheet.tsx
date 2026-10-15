"use client";
import { checkTappable } from "../../../lib/telemetry";
import { FramedPhoto } from "../../../lib/framed-photo";
// One bid sheet for every Bid button. Truth before reassurance: "leading" appears only after the server's receipt; a lost
// response is Unconfirmed and offers only Check status, which replays the same request id (never a second bid).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { api, dollarsInput, errorText, fmtClock, newId, parseDollars } from "../../../lib/api";
import { formatMoney } from "../../../lib/money";
import { IAlert, ICheck, IClose, IMinus, IPlus, IWifiOff } from "../../../lib/icons";
import { REASONS, type Item, type Me, type PendingBid, type Receipt } from "./model";
import type { Alert } from "./moments";
import { ItemArt, Mark } from "./ui";

type State = "edit" | "sending" | "landed" | "rejected" | "unconfirmed";
type Props = {
  item: Item; me: Me; code: string; pendingKey: string; initialAmount?: number; offline: boolean;
  onPending: (p: PendingBid | null) => void; onClose: () => void; onSettled: () => void; notify: (a: Omit<Alert, "id">) => void;
};

function readPending(key: string, itemId: string): PendingBid | null {
  try { const raw = localStorage.getItem(key); const p = raw ? JSON.parse(raw) as PendingBid : null; return p?.itemId === itemId ? p : null; } catch { return null; }
}

export function BidSheet({ item, me, code, pendingKey, initialAmount, offline, onPending, onClose, onSettled, notify }: Props) {
  const minimum = item.minimumNextMinor ?? 0;
  const start = Math.max(initialAmount ?? minimum, minimum);
  const [amount, setAmount] = useState(start), [text, setText] = useState(dollarsInput(start));
  const request = useRef<PendingBid | null>(null);
  const [state, setState] = useState<State>(() => { const p = typeof window === "undefined" ? null : readPending(pendingKey, item.id); if (p) request.current = p; return p ? "unconfirmed" : "edit"; });
  const [message, setMessage] = useState("");
  const [landed, setLanded] = useState<Receipt | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef<number | null>(null);
  const closed = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const finish = () => { if (closed.current) return; closed.current = true; clearTimeout(timer.current); onClose(); };
  useEffect(() => () => clearTimeout(timer.current), []);

  // Keep the native-dialog guarantees without relying on WebKit's top-layer/backdrop painting.
  const closeRef = useRef(() => {});
  closeRef.current = () => close();
  const focusables = () => [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])') ?? [])]
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = document.documentElement, body = document.body, y = window.scrollY;
    const overflow = root.style.overflow, position = body.style.position, top = body.style.top, width = body.style.width;
    root.style.overflow = "hidden"; body.style.position = "fixed"; body.style.top = `-${y}px`; body.style.width = "100%";
    const layer = dialog.current!.parentElement!;
    const hidden: { el: HTMLElement; aria: string | null; inert: boolean }[] = [];
    for (let branch: HTMLElement | null = layer; branch && branch !== body; branch = branch.parentElement) {
      for (const el of [...(branch.parentElement?.children ?? [])]) {
        if (el === branch || !(el instanceof HTMLElement) || ["SCRIPT", "STYLE", "LINK"].includes(el.tagName)) continue;
        hidden.push({ el, aria: el.getAttribute("aria-hidden"), inert: el.inert });
        el.setAttribute("aria-hidden", "true"); el.inert = true;
      }
    }
    const focus = () => dialog.current?.querySelector<HTMLElement>("#bid-title")?.focus({ preventScroll: true });
    focus();
    const onFocus = (e: FocusEvent) => { if (!dialog.current?.contains(e.target as Node)) focus(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); } };
    const resize = () => {
      const v = window.visualViewport;
      layer.style.setProperty("--sheet-vh", `${v?.height ?? window.innerHeight}px`);
      layer.style.setProperty("--sheet-top", `${v?.offsetTop ?? 0}px`);
    };
    resize(); window.visualViewport?.addEventListener("resize", resize); window.visualViewport?.addEventListener("scroll", resize);
    document.addEventListener("keydown", onKey, true); document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey, true); document.removeEventListener("focusin", onFocus);
      window.visualViewport?.removeEventListener("resize", resize); window.visualViewport?.removeEventListener("scroll", resize);
      hidden.forEach(({ el, aria, inert }) => { if (aria === null) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", aria); el.inert = inert; });
      root.style.overflow = overflow; body.style.position = position; body.style.top = top; body.style.width = width;
      window.scrollTo(0, y); if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const trapFocus = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialog.current) return;
    const f = focusables(), active = document.activeElement;
    if (!f.length) { e.preventDefault(); dialog.current.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (active === first || !f.includes(active as HTMLElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !f.includes(active as HTMLElement))) { e.preventDefault(); first.focus(); }
  };
  useEffect(() => state === "landed" || state === "sending" ? undefined : checkTappable("bid-sheet", () => dialog.current?.querySelector("[data-bid-primary]") ?? null), [state]);
  // If the minimum rises while the sheet is open (someone else bid), lift the amount with it.
  useEffect(() => { if (state === "edit" && amount < minimum) set(minimum); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [minimum]);

  const set = (minor: number) => { setAmount(minor); setText(dollarsInput(minor)); };
  const valid = amount >= minimum && amount > 0;
  const picks = [minimum, minimum + item.incrementMinor, minimum + item.incrementMinor * 3];
  const busy = state === "sending";
  const close = () => { if (!busy) finish(); };
  const remember = (p: PendingBid | null) => { try { if (p) localStorage.setItem(pendingKey, JSON.stringify(p)); else localStorage.removeItem(pendingKey); } catch { /* ignore */ } onPending(p); };

  function settle(receipt: Receipt) {
    remember(null);
    if (receipt.accepted) {
      navigator.vibrate?.(30);
      setLanded(receipt); setState("landed"); onSettled();
      timer.current = setTimeout(finish, 2200);
      return;
    }
    setState("rejected"); setMessage(REASONS[receipt.reason ?? ""] ?? "Your bid wasn't placed.");
    if (receipt.minimumNextMinor) set(receipt.minimumNextMinor);
    onSettled();
  }

  async function submit(retry = false) {
    if (!retry) { request.current = { requestId: newId(), itemId: item.id, amountMinor: amount }; remember(request.current); }
    const pending = request.current!;
    setState("sending"); setMessage("");
    try {
      const r = await api<{ receipt: Receipt }>("POST", `/api/v1/e/${code}/bid`, pending);
      if (r.data?.receipt) { settle(r.data.receipt); return; }
      if (r.status >= 500) { setState("unconfirmed"); return; }
      remember(null); setState("rejected"); setMessage(errorText(r));
    } catch { setState("unconfirmed"); }
  }

  async function check() {
    const pending = request.current; if (!pending) return;
    setState("sending");
    try {
      const r = await api<{ receipt: Receipt | null }>("GET", `/api/v1/e/${code}/receipt/${pending.requestId}`);
      if (!r.ok) { setState("unconfirmed"); return; }
      if (r.data.receipt) settle(r.data.receipt);
      else submit(true); // Never recorded: safe to resend the same request.
    } catch { setState("unconfirmed"); notify({ tone: "ink", title: "Still offline", body: "Tap Check status once you're connected." }); }
  }

  const onPointerDown = (e: React.PointerEvent) => { if (busy || state === "landed") return; dragStart.current = e.clientY; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); };
  const onPointerMove = (e: React.PointerEvent) => { if (dragStart.current !== null) setDrag(Math.max(0, e.clientY - dragStart.current)); };
  const onPointerUp = () => { if (dragStart.current === null) return; dragStart.current = null; if (drag > 110) close(); setDrag(0); };

  return (
    // A plain fixed overlay, not <dialog>: older iOS Safari left a modal backdrop with no visible sheet.
    <div className="pa-sheet-layer" onClick={e => { if (e.target === e.currentTarget) close(); }}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="bid-title" className={`pa-sheet${drag ? " dragging" : ""}`}
      style={{ "--drag": `${drag}px` } as CSSProperties} onKeyDown={trapFocus}>
      <div className="sheet-in">
        <div className="sheet-grab" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          <span className="grab" aria-hidden="true" />
          <div className="sheet-head">
            <h2 id="bid-title" tabIndex={-1}>{state === "landed" ? "Bid placed" : state === "unconfirmed" ? "Did it go through?" : "Place a bid"}</h2>
            {!busy && state !== "landed" && <button type="button" className="x" aria-label="Close" onClick={close}><IClose size={22} /></button>}
          </div>
        </div>

        {state === "landed" && landed ? <Landed receipt={landed} item={item} onDone={finish} /> : (
          <>
            <div className="sheet-scroll">
              <div className="lotmini">
                <span className="lm-thumb">{item.imageUrl ? <FramedPhoto src={item.imageUrl} frame={item.imageFrame} className="pf-fill" /> : <ItemArt item={item} size="sm" />}</span>
                <div><p>{item.title}</p><span className="lm-for"><Mark name={me.businessName} you size={18} />Bidding as <b>{me.businessName}</b></span></div>
              </div>

              {state === "unconfirmed" ? (
                <div className="result t-dashed" role="status">
                  <span className="r-ic"><IAlert size={22} /></span>
                  <h3>We couldn&rsquo;t confirm your {formatMoney(request.current?.amountMinor ?? amount)} bid</h3>
                  <p>The connection dropped before we heard back. Checking won&rsquo;t place a second bid.</p>
                  {offline && <p className="r-note"><IWifiOff size={16} /> You&rsquo;re offline. Check again once you&rsquo;re connected.</p>}
                </div>
              ) : (
                <>
                  <div className="amount">
                    <label className="lbl" htmlFor="bid-amount">Your bid <span>minimum {formatMoney(minimum)}</span></label>
                    <div className="pa-stepper">
                      <button type="button" className="pa-step" aria-label={`Lower by ${formatMoney(item.incrementMinor)}`} disabled={amount - item.incrementMinor < minimum || busy} onClick={() => set(amount - item.incrementMinor)}><IMinus size={24} /></button>
                      <div className={`amt-field${!valid && text ? " bad" : ""}`}>
                        <span className="cur">$</span>
                        <input id="bid-amount" inputMode="decimal" autoComplete="off" value={text} disabled={busy} aria-invalid={!valid}
                          onChange={e => { const raw = e.target.value.replace(/[^0-9.,]/g, ""); setText(raw); setAmount(parseDollars(raw) ?? 0); if (state === "rejected") setState("edit"); }} />
                      </div>
                      <button type="button" className="pa-step" aria-label={`Raise by ${formatMoney(item.incrementMinor)}`} disabled={busy} onClick={() => set(Math.max(amount, minimum) + item.incrementMinor)}><IPlus size={24} /></button>
                    </div>
                    <div className="quick" role="group" aria-label="Quick amounts">
                      {picks.map((p, i) => <button type="button" key={p} className={`qbtn${amount === p ? " on" : ""}`} disabled={busy} onClick={() => set(p)}><small>{["Minimum", "+1 step", "+3 steps"][i]}</small>{formatMoney(p)}</button>)}
                    </div>
                    {!valid && text && <p className="err" role="alert">Enter at least {formatMoney(minimum)}.</p>}
                  </div>
                  {state === "rejected" ? (
                    <div className="result t-red" role="alert">
                      <span className="r-ic"><IAlert size={22} /></span>
                      <h3>Not placed</h3><p>{message} {item.minimumNextMinor ? <>The minimum is now <b>{formatMoney(item.minimumNextMinor)}</b>.</> : null}</p>
                    </div>
                  ) : (
                    <p className="sheet-note">{item.currentMinor === null ? "No bids yet." : <>Top bid <b className="amt">{formatMoney(item.currentMinor)}</b>{item.leader ? <> by {item.leader.business}</> : null}.</>} You&rsquo;re leading once it&rsquo;s confirmed.</p>
                  )}
                </>
              )}
            </div>
            <div className="sheet-foot">
              {state === "unconfirmed"
                ? <button type="button" data-bid-primary className="btn primary block lg" onClick={check}>Check status</button>
                : <button type="button" data-bid-primary className={`btn primary block lg${busy ? " sending" : ""}`} disabled={!valid || busy || offline} onClick={() => submit()}>
                    {busy ? <><span className="spinner" aria-hidden="true" />Sending…</> : offline ? "Offline — reconnecting" : `Bid ${valid ? formatMoney(amount) : ""}`}
                  </button>}
            </div>
          </>
        )}
      </div>
    </div>
    </div>
  );
}

/** The moment a bid lands: confirmed by the server, so it is allowed to feel good. */
function Landed({ receipt, item, onDone }: { receipt: Receipt; item: Item; onDone: () => void }) {
  return (
    <div className="landed" role="status" aria-live="assertive">
      <div className="burst" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ "--a": `${i * (360 / 14)}deg`, "--d": `${60 + (i % 3) * 18}px` } as CSSProperties} />)}</div>
      <span className="landed-check"><ICheck size={44} /></span>
      <h3>You&rsquo;re leading</h3>
      <b className="amt landed-amt">{formatMoney(receipt.amountMinor)}</b>
      <p>{item.title} · {fmtClock(receipt.decidedAt ?? new Date())}</p>
      <button type="button" className="btn quiet" onClick={onDone}>Done</button>
    </div>
  );
}

/** After a reload, resolves a bid whose response never arrived. */
export function ResumePending({ code, pendingKey, onResolved }: { code: string; pendingKey: string; onResolved: (text: string, ok: boolean) => void }) {
  const report = useRef(onResolved);
  report.current = onResolved;
  // Runs once per page load, so it never races a bid being sent from this page.
  useEffect(() => {
    let raw: string | null = null;
    try { raw = localStorage.getItem(pendingKey); } catch { return; }
    if (!raw) return;
    const pending = JSON.parse(raw) as PendingBid;
    api<{ receipt: Receipt | null }>("GET", `/api/v1/e/${code}/receipt/${pending.requestId}`).then(r => {
      if (!r.ok) return;
      localStorage.removeItem(pendingKey);
      if (r.data.receipt?.accepted) { report.current(`Your ${formatMoney(pending.amountMinor)} bid went through`, true); }
      else if (r.data.receipt) report.current(`Your ${formatMoney(pending.amountMinor)} bid wasn’t placed`, false);
      else report.current(`Your ${formatMoney(pending.amountMinor)} bid didn’t reach us. Nothing was placed.`, false);
    }).catch(() => {});
  }, [code, pendingKey]);
  return null;
}
