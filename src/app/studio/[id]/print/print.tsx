"use client";
// Printable QR: a 4×6 in table card, or a full Letter page for the door or the bar. On screen it shows a preview with a
// print button; on paper only the card or page prints, at its exact size.
import { useEffect, useState } from "react";
import { api, fmtTime } from "../../../../lib/api";
import { THEMES } from "../../../../lib/templates";
import { IPrint } from "../../../../lib/icons";
import type { Data } from "../../data";
import { Brand, Qr } from "../../kit";
import "../../studio.css";

export default function PrintCards({ eventId, layout: initial }: { eventId: string; layout: "card" | "page" }) {
  const [data, setData] = useState<Data | null>(null), [origin, setOrigin] = useState(""), [layout, setLayout] = useState(initial), [error, setError] = useState("");
  useEffect(() => {
    setOrigin(location.origin);
    api<Data>("GET", `/api/v1/host/events/${eventId}`).then(r => r.ok ? setData(r.data) : setError(r.status === 401 ? "Sign in to Studio to print." : "That event isn't available.")).catch(() => setError("Can't reach BidZizi."));
  }, [eventId]);
  const pick = (l: "card" | "page") => { setLayout(l); history.replaceState(null, "", `?layout=${l}`); };
  if (error) return <main className="sx sx-center"><div className="sx-loading"><Brand /><p>{error}</p><a className="sx-btn" href="/studio">Open Studio</a></div></main>;
  if (!data || !origin) return <main className="sx sx-center"><div className="sx-loading"><Brand /><span className="dots"><i /><i /><i /></span></div></main>;
  const e = data.event, theme = THEMES.find(t => t.id === e.theme) ?? THEMES[0];
  const link = `${origin}/e/${e.code}`, host = origin.replace(/^https?:\/\//, "");
  return (
    <main className={`sx print-view l-${layout}`}>
      <style>{layout === "card" ? "@page { size: 4in 6in; margin: 0; }" : "@page { size: letter; margin: 0; }"}</style>
      <div className="pv-bar">
        <a className="sx-btn ghost sm" href={`/studio/${e.id}`}>Back to Studio</a>
        <div className="sx-seg" role="tablist" aria-label="Layout">
          <button type="button" role="tab" aria-selected={layout === "card"} className={layout === "card" ? "on" : ""} onClick={() => pick("card")}>Table card · 4×6 in</button>
          <button type="button" role="tab" aria-selected={layout === "page"} className={layout === "page" ? "on" : ""} onClick={() => pick("page")}>Full page · Letter</button>
        </div>
        <button type="button" className="sx-btn primary" onClick={() => window.print()}><IPrint size={17} />Print</button>
      </div>
      <p className="pv-tip">{layout === "card" ? "Print on 4×6 in card stock, or on Letter and trim. Turn off headers and footers in the print settings." : "Print at 100% on Letter paper. Turn off headers and footers in the print settings."}</p>
      <section className="pv-sheet" style={{ background: theme.ink, color: theme.paper }}>
        <span className="pv-eyebrow" style={{ color: theme.accent }}>Scan to bid</span>
        <h1 className="pv-name">{e.name}</h1>
        {layout === "page" && <p className="pv-when">{fmtTime(e.startsAt, e.timezone)}{e.venue ? ` · ${e.venue}` : ""}</p>}
        <Qr text={link} label={`QR code that opens ${e.name}`} className="pv-qr" dark={theme.ink} light="#FFFFFF" />
        <p className="pv-or">No camera? Go to <b>{host}/join</b> and enter</p>
        <b className="pv-code" style={{ color: theme.accent }}>{e.code}</b>
        {layout === "page" && <p className="pv-remote">Joining from somewhere else? The same link works anywhere.</p>}
        <span className="pv-brand">Bid<i>Zizi</i></span>
      </section>
    </main>
  );
}
