"use client";
import { useEffect, useRef, useState } from "react";
import { fmtTime } from "../../../lib/api";
import { THEMES } from "../../../lib/templates";
import { ICheck, IClose, ICopy, IExternal, IPrint, IBolt } from "../../../lib/icons";
import type { Data } from "../data";
import { Qr, Switch } from "../kit";

export function ShareDialog({ data, onClose, patchEvent, onGoLive }: { data: Data; onClose: () => void; patchEvent: (f: Record<string, unknown>) => Promise<boolean>; onGoLive: () => void }) {
  const e = data.event;
  const ref = useRef<HTMLDialogElement>(null);
  const [origin, setOrigin] = useState(""), [copied, setCopied] = useState(false);
  useEffect(() => { setOrigin(location.origin); ref.current?.showModal(); }, []);
  const link = `${origin}/e/${e.code}`, host = origin.replace(/^https?:\/\//, "");
  const theme = THEMES.find(t => t.id === e.theme) ?? THEMES[0];
  const draft = e.status === "draft";
  return (
    <dialog ref={ref} className="sx-dialog share" aria-labelledby="share-title" onClose={onClose}>
      <button type="button" className="sx-icon-btn dlg-x" aria-label="Close" onClick={() => ref.current?.close()}><IClose size={22} /></button>
      <div className="share-grid">
        <div className="share-card print-card" style={{ background: theme.ink, color: theme.paper }}>
          <span className="sc-eyebrow" style={{ color: theme.accent }}>Scan to bid</span>
          <b className="sc-name">{e.name}</b>
          {origin && <Qr text={link} label={`QR code that opens ${e.name}`} className="sc-qr" dark={theme.ink} light="#FFFFFF" />}
          <span className="sc-or">or go to <b>{host}/join</b> and enter</span>
          <span className="sc-code" style={{ color: theme.accent }}>{e.code}</span>
        </div>
        <div className="share-side">
          <span className="sx-eyebrow">{draft ? "Draft" : "Live"}</span>
          <h2 id="share-title">{draft ? "Preview, then go live" : "Share your event"}</h2>
          {draft ? (
            <>
              <div className="note-card">
                <b>About this preview</b>
                <p>Right now the code only opens on a phone or computer that&rsquo;s signed in to Studio. To check it on your phone, sign in at <b>{host}/studio</b> there first, then scan the code.</p>
                <p>Guests can join once you go live. Nothing they see changes; going live just opens the doors.</p>
              </div>
              <div className="share-acts">
                <a className="sx-btn" href={link} target="_blank"><IExternal size={16} />Open preview here</a>
                <button type="button" className="sx-btn primary" onClick={onGoLive}><IBolt size={16} />Go live</button>
              </div>
            </>
          ) : (
            <>
              <p className="sx-muted">Put the code on screen, on table cards, or read it out. Guests scan it or type it at {host}/join.</p>
              <div className="link-box"><span>{link}</span><button type="button" className="sx-btn sm" onClick={async () => { await navigator.clipboard.writeText(link).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1800); }}>{copied ? <><ICheck size={15} />Copied</> : <><ICopy size={15} />Copy</>}</button></div>
              <div className="share-acts">
                <button type="button" className="sx-btn" onClick={() => window.print()}><IPrint size={16} />Print a table card</button>
                <a className="sx-btn" href={link} target="_blank"><IExternal size={16} />Open guest view</a>
              </div>
              <Switch on={e.entryOpen} onChange={v => patchEvent({ entryOpen: v })} label="New guests can join" sub={`People who already joined keep access until ${fmtTime(e.accessEndsAt, e.timezone)}.`} />
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
