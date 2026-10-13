"use client";
// Practice reset, archive/restore and delete. The server decides what's allowed (practice events and unjoined drafts can be
// deleted; joined real events never); destructive actions ask you to type the event name.
import { useRef, useState } from "react";
import { api, errorText, newId } from "../../../lib/api";
import { IChevD } from "../../../lib/icons";
import type { Data } from "../data";

type Ctx = { data: Data; reload: () => Promise<void>; flash: (t: string, tone?: "ink" | "red" | "green") => void };
type Action = "reset" | "archive" | "delete";

export function Housekeeping({ ctx }: { ctx: Ctx }) {
  const e = ctx.data.event;
  const resetId = useRef(newId());
  const [action, setAction] = useState<Action | null>(null), [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const canDelete = e.isPractice || (e.status === "draft" && !ctx.data.participants.length);
  const canArchive = !e.archivedAt && (e.isPractice || e.status === "draft");

  async function run(method: string, path: string, body: object) {
    setBusy(true); setError("");
    const r = await api(method, path, body).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setError(r ? errorText(r) : "Connection lost. Check the event before trying again."); return false; }
    return true;
  }
  async function confirmAction() {
    if (action === "reset") {
      if (await run("POST", `/api/v1/host/events/${e.id}/reset`, { requestId: resetId.current })) {
        resetId.current = newId(); setAction(null); setTyped("");
        ctx.flash("Practice reset. Share the new join code for your next run.", "green"); await ctx.reload();
      }
    } else if (action === "archive") {
      if (await run("POST", `/api/v1/host/events/${e.id}/archive`, {})) { setAction(null); ctx.flash("Event archived"); await ctx.reload(); }
    } else if (action === "delete") {
      if (await run("DELETE", `/api/v1/host/events/${e.id}`, {})) location.href = "/studio";
    }
  }
  const pick = (a: Action) => { setAction(a); setTyped(""); setError(""); };
  const needsName = action === "reset" || action === "delete";

  return (
    <details className="sx-adv housekeeping">
      <summary>Event housekeeping{e.isPractice ? " · Practice" : ""}<IChevD size={16} /></summary>
      <p className="sx-hint">{e.isPractice
        ? "Reset keeps the setup and items, removes every rehearsal guest, bid, donation and result, and gives the event a new join code."
        : e.status === "live"
          ? "This is a live event, so it can't be archived or deleted. Its records stay for your reports and exports."
          : "Drafts can be archived and restored later. Only drafts nobody has joined can be deleted."}</p>
      {e.archivedAt && <p className="hk-state">Archived. Guests can&rsquo;t open it.</p>}
      <div className="hk-acts">
        {e.isPractice && <button type="button" className="sx-btn sm" onClick={() => pick("reset")}>Reset practice</button>}
        {e.archivedAt && <button type="button" className="sx-btn sm" disabled={busy} onClick={async () => { if (await run("POST", `/api/v1/host/events/${e.id}/restore`, {})) { ctx.flash("Event restored", "green"); await ctx.reload(); } }}>Restore event</button>}
        {canArchive && <button type="button" className="sx-btn sm" onClick={() => pick("archive")}>Archive event</button>}
        {canDelete && <button type="button" className="sx-btn danger-ghost sm" onClick={() => pick("delete")}>Delete event</button>}
      </div>
      {action && (
        <form className="ops-confirm" onSubmit={x => { x.preventDefault(); confirmAction(); }}>
          <b>{action === "reset" ? "Erase all rehearsal activity?" : action === "delete" ? "Delete this event for good?" : "Archive this event?"}</b>
          <p>{action === "archive" ? "Guests won't be able to open it. Everything is kept, and you can restore it here." : "This can't be undone. Type the event name to confirm."}</p>
          {needsName && <label className="sx-field"><span className="sx-label">Type {e.name}</span><input value={typed} onChange={x => setTyped(x.target.value)} autoFocus autoComplete="off" /></label>}
          <div className="ops-acts">
            <button className={`sx-btn sm ${action === "archive" ? "primary" : "danger"}`} disabled={busy || (needsName && typed !== e.name)}>
              {busy ? "Working…" : action === "reset" ? "Confirm reset" : action === "delete" ? "Confirm delete" : "Confirm archive"}</button>
            <button type="button" className="sx-btn ghost sm" onClick={() => setAction(null)}>Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="sx-error" role="alert">{error}</p>}
    </details>
  );
}
