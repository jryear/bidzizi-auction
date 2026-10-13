"use client";
// Share: everything a host needs to get people in. The room code, the link (copy, native share, email, text),
// printable QR cards, and a reminder that remote guests use the very same link.
import { useEffect, useRef, useState } from "react";
import { fmtTime } from "../../../lib/api";
import { THEMES } from "../../../lib/templates";
import { ICheck, IClose, ICopy, IExternal, IPrint, IBolt, IShare } from "../../../lib/icons";
import type { Data } from "../data";
import { Qr, Switch } from "../kit";

export function ShareDialog({ data, onClose, patchEvent, onGoLive }: { data: Data; onClose: () => void; patchEvent: (f: Record<string, unknown>) => Promise<boolean>; onGoLive: () => void }) {
  const e = data.event;
  const ref = useRef<HTMLDialogElement>(null);
  const [origin, setOrigin] = useState(""), [copied, setCopied] = useState<"" | "link" | "code">(""), [canShare, setCanShare] = useState(false);
  useEffect(() => { setOrigin(location.origin); setCanShare(typeof navigator.share === "function"); ref.current?.showModal(); }, []);
  const link = `${origin}/e/${e.code}`, host = origin.replace(/^https?:\/\//, "");
  const base = THEMES.find(t => t.id === e.theme) ?? THEMES[0], theme = { ...base, accent: e.accentColor ?? base.accent };
  const draft = e.status === "draft";
  const message = `Join ${e.name} and bid from your phone: ${link} (event code ${e.code})`;
  const copy = async (text: string, what: "link" | "code") => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(""), 1800); } catch { /* the link stays selectable */ }
  };
  const print = (layout: "card" | "page") => window.open(`/studio/${e.id}/print?layout=${layout}`, "_blank");

  return (
    <dialog ref={ref} className="sx-dialog share" aria-labelledby="share-title" onClose={onClose}>
      <button type="button" className="sx-icon-btn dlg-x" aria-label="Close" onClick={() => ref.current?.close()}><IClose size={22} /></button>
      <div className="share-grid">
        <div className="share-card" style={{ background: theme.ink, color: theme.paper }}>
          <span className="sc-eyebrow" style={{ color: theme.accent }}>Scan to bid</span>
          <b className="sc-name">{e.name}</b>
          {origin && <Qr text={link} label={`QR code that opens ${e.name}`} className="sc-qr" dark={theme.ink} light="#FFFFFF" />}
          <span className="sc-or">or go to <b>{host}/join</b> and enter</span>
          <span className="sc-code" style={{ color: theme.accent }}>{e.code}</span>
        </div>

        <div className="share-side">
          <h2 id="share-title">{draft ? "Share once you're live" : "Share your event"}</h2>
          {draft && <p className="share-draft">This event is a draft, so the code only opens on devices signed in to Studio. You can copy, send and print now; it works for guests the moment you go live.</p>}

          <div className="room-code">
            <span className="rc-l">Room code</span>
            <b className="rc-v">{e.code}</b>
            <button type="button" className="sx-btn ghost sm" onClick={() => copy(e.code, "code")}>{copied === "code" ? <><ICheck size={15} />Copied</> : <><ICopy size={15} />Copy</>}</button>
          </div>

          <div className="link-box"><span>{link}</span>
            <button type="button" className="sx-btn sm" onClick={() => copy(link, "link")}>{copied === "link" ? <><ICheck size={15} />Copied</> : <><ICopy size={15} />Copy link</>}</button></div>

          <div className="share-acts">
            {canShare && <button type="button" className="sx-btn" onClick={() => navigator.share({ title: e.name, text: `Join ${e.name} and bid from your phone (event code ${e.code}).`, url: link }).catch(() => {})}><IShare size={16} />Share…</button>}
            <a className="sx-btn" href={`mailto:?subject=${encodeURIComponent(`You're invited: ${e.name}`)}&body=${encodeURIComponent(message)}`}>Email</a>
            <a className="sx-btn" href={`sms:?&body=${encodeURIComponent(message)}`}>Text message</a>
          </div>

          <div className="print-row">
            <span className="sx-label">Print the QR code</span>
            <div className="share-acts">
              <button type="button" className="sx-btn" onClick={() => print("card")}><IPrint size={16} />Table card</button>
              <button type="button" className="sx-btn" onClick={() => print("page")}><IPrint size={16} />Full page</button>
            </div>
          </div>

          <p className="remote-note"><b>Guests who can&rsquo;t be there</b> use the same link. They join, browse and bid exactly like people in the room.</p>

          {draft ? (
            <div className="share-acts">
              <a className="sx-btn ghost" href={link} target="_blank"><IExternal size={16} />Preview</a>
              <button type="button" className="sx-btn primary" onClick={onGoLive}><IBolt size={16} />Go live</button>
            </div>
          ) : (
            <Switch on={e.entryOpen} onChange={v => patchEvent({ entryOpen: v })} label="New guests can join" sub={`People who already joined keep access until ${fmtTime(e.accessEndsAt, e.timezone)}.`} />
          )}
        </div>
      </div>
    </dialog>
  );
}
