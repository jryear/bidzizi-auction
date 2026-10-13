"use client";
import { photoStyle } from "../../../lib/photo";
import { useEffect, useRef, type CSSProperties } from "react";
import { formatMoney } from "../../../lib/money";
import { IAlert, ICheck, IClose, IInfo, ITrophy } from "../../../lib/icons";
import { lotNo, seenOnce, type Item } from "./model";
import { ItemArt } from "./ui";

export type Alert = { id: string; key?: string; tone: "red" | "green" | "ink"; title: string; body?: string; itemId?: string; action?: { label: string; amount: number } };

/** Alerts slide in from the top. Outbid is red, stays longer, and offers one-tap rebid. */
export function Alerts({ alerts, onDismiss, onAct }: { alerts: Alert[]; onDismiss: (id: string) => void; onAct: (a: Alert) => void }) {
  return (
    <div className="alerts" aria-live="polite">
      {alerts.map(a => <AlertCard key={a.id} a={a} onDismiss={onDismiss} onAct={onAct} />)}
    </div>
  );
}

function AlertCard({ a, onDismiss, onAct }: { a: Alert; onDismiss: (id: string) => void; onAct: (a: Alert) => void }) {
  const life = a.tone === "red" ? 9000 : 4200;
  useEffect(() => { const t = setTimeout(() => onDismiss(a.id), life); return () => clearTimeout(t); }, [a.id, life, onDismiss]);
  return (
    <div className={`alert t-${a.tone}`} role={a.tone === "red" ? "alert" : "status"} style={{ "--life": `${life}ms` } as CSSProperties}>
      <span className="al-ic">{a.tone === "red" ? <IAlert size={20} /> : a.tone === "green" ? <ICheck size={20} /> : <IInfo size={20} />}</span>
      <div className="al-t"><b>{a.title}</b>{a.body && <span>{a.body}</span>}</div>
      {a.action && <button type="button" className="al-act" onClick={e => { e.currentTarget.focus({ preventScroll: true }); onAct(a); }}>{a.action.label}</button>}
      <button type="button" className="al-x" aria-label="Dismiss" onClick={() => onDismiss(a.id)}><IClose size={18} /></button>
      <i className="al-life" aria-hidden="true" />
    </div>
  );
}

const CONFETTI = ["#F2B632", "#2338C7", "#12724A", "#C93A1B", "#FFFCF5", "#F2B632"];

/** Winning is the best moment in the product. It gets the whole screen, once per item. */
/** `ambient`: a decorative replay (the Studio sign-in scene). It never takes focus, vibrates, records the win or listens for keys. */
export function Celebration({ item, code, instructions, onClose, ambient = false }: { item: Item; code: string; instructions: string; onClose: (target: "mine" | "stay") => void; ambient?: boolean }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (ambient) return; seenOnce(`bz_won_${code}_${item.id}`); button.current?.focus(); if (navigator.vibrate) navigator.vibrate([40, 60, 40, 60, 120]); }, [code, item.id, ambient]);
  useEffect(() => { if (ambient) return; const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose("stay"); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose, ambient]);
  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-labelledby="won-title">
      <div className="confetti" aria-hidden="true">
        {Array.from({ length: 70 }, (_, i) => (
          <i key={i} style={{ "--x": `${(i * 53) % 100}%`, "--c": CONFETTI[i % CONFETTI.length], "--d": `${2.4 + (i % 7) * 0.35}s`, "--delay": `${(i % 10) * 0.08}s`, "--r": `${(i * 47) % 360}deg`, "--w": `${6 + (i % 3) * 3}px` } as CSSProperties} />
        ))}
      </div>
      <div className="won-card">
        <button type="button" className="won-x" aria-label="Close" onClick={() => onClose("stay")}><IClose size={22} /></button>
        <span className="won-eyebrow"><ITrophy size={18} />Confirmed by the event staff</span>
        <h2 id="won-title">You won!</h2>
        <div className="polaroid">
          <div className="pol-img">{item.imageUrl ? <img style={photoStyle(item.imageFocal)} src={item.imageUrl} alt="" /> : <ItemArt item={item} />}</div>
          <div className="pol-cap"><span>Item {lotNo(item)}</span><b>{item.title}</b></div>
        </div>
        <p className="won-amt"><span>Winning bid</span><b className="amt">{formatMoney(item.award?.amountMinor ?? item.currentMinor ?? 0)}</b></p>
        {instructions && <div className="won-next"><b>What to do next</b><p>{instructions}</p></div>}
        <div className="won-btns">
          <button ref={button} type="button" className="btn primary lg block" onClick={() => onClose("mine")}>See my wins</button>
          <button type="button" className="btn-link light" onClick={() => onClose("stay")}>Keep browsing</button>
        </div>
      </div>
    </div>
  );
}
