"use client";
// Going live is the one consequential switch, so it gets a readiness check first. It warns; it never blocks.
import { useEffect, useRef, useState } from "react";
import { IAlert, IBolt, ICheck, IChevR, IClose } from "../../../lib/icons";
import { isConfirmed, type Data } from "../data";
import type { Screen, Sel } from "./setup";

type Check = { key: string; ok: boolean; title: string; detail: string; fix: { sel: Sel; screen?: Screen } | "add" };

export function readiness(d: Data): Check[] {
  const e = d.event, noPhoto = d.items.filter(i => !i.imageUrl);
  return [
    { key: "items", ok: d.items.length > 0, title: d.items.length ? `${d.items.length} item${d.items.length === 1 ? "" : "s"} ready to bid on` : "No items yet",
      detail: d.items.length ? "" : "Guests will see an empty catalogue.", fix: "add" },
    { key: "photos", ok: d.items.length > 0 && !noPhoto.length, title: noPhoto.length ? `${noPhoto.length} item${noPhoto.length === 1 ? " has" : "s have"} no photo` : "Every item has a photo",
      detail: noPhoto.length ? "Items without photos show a numbered plate instead." : "", fix: noPhoto[0] ? { sel: { kind: "item", id: noPhoto[0].id }, screen: "item" } : "add" },
    { key: "schedule", ok: isConfirmed(e.id, "schedule"), title: isConfirmed(e.id, "schedule") ? "Date and time confirmed" : "Date and time not confirmed yet",
      detail: "Check when bidding opens and closes.", fix: { sel: { kind: "schedule" }, screen: "welcome" } },
    { key: "cover", ok: Boolean(e.coverUrl), title: e.coverUrl ? "Cover photo added" : "No cover photo",
      detail: e.coverUrl ? "" : "The welcome screen shows a plain lettered cover.", fix: { sel: { kind: "event" }, screen: "welcome" } },
  ];
}

export function GoLiveDialog({ data, onGoLive, onFix, onAdd, onClose }: {
  data: Data; onGoLive: () => Promise<boolean>; onFix: (sel: Sel, screen?: Screen) => void; onAdd: () => void; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const checks = readiness(data), open = checks.filter(c => !c.ok);
  const fix = (c: Check) => { ref.current?.close(); if (c.fix === "add") onAdd(); else onFix(c.fix.sel, c.fix.screen); };
  return (
    <dialog ref={ref} className="sx-dialog golive-dlg" aria-labelledby="gl-title" onClose={onClose} onCancel={e => { if (busy) e.preventDefault(); }}>
      <button type="button" className="sx-icon-btn dlg-x" aria-label="Close" onClick={() => ref.current?.close()}><IClose size={22} /></button>
      <div className="gl-body">
        <span className={`gl-ic${open.length ? " warn" : ""}`}>{open.length ? <IAlert size={24} /> : <IBolt size={24} />}</span>
        <h2 id="gl-title">{open.length ? `${open.length} thing${open.length === 1 ? "" : "s"} to check before you go live` : "Ready to go live"}</h2>
        <p className="sx-muted">Going live lets guests join with your code. After that, every change you make appears on their phones straight away.</p>
        <ul className="gl-list">
          {checks.map(c => (
            <li key={c.key} className={c.ok ? "ok" : "warn"}>
              <span className="gl-tick" aria-hidden="true">{c.ok ? <ICheck size={14} /> : "!"}</span>
              <span className="gl-t"><b>{c.title}</b>{!c.ok && c.detail && <small>{c.detail}</small>}</span>
              {!c.ok && <button type="button" className="sx-btn ghost sm" onClick={() => fix(c)}>Fix<IChevR size={16} /></button>}
            </li>
          ))}
        </ul>
        <div className="gl-acts">
          <button type="button" className="sx-btn primary lg" disabled={busy} onClick={async () => { setBusy(true); const ok = await onGoLive(); setBusy(false); if (ok) ref.current?.close(); }}>
            <IBolt size={18} />{busy ? "Going live…" : open.length ? "Go live anyway" : "Go live"}</button>
          <button type="button" className="sx-btn ghost lg" disabled={busy} onClick={() => ref.current?.close()}>Not yet</button>
        </div>
      </div>
    </dialog>
  );
}
