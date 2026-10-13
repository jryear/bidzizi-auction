"use client";
// Reorder a list three ways: drag its handle (mouse, pen or finger), pick it up from the keyboard (Space, arrows, Space;
// Escape cancels), or nudge it with Alt+↑/↓. Rows carry data-reorder-id; handles carry data-reorder-handle.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { api, errorText } from "../../lib/api";
import type { Data } from "./data";
import type { SetupCtx } from "./[id]/setup";

type Drag = { id: string; pointer: number; startY: number; grabOffset: number; active: boolean; el: HTMLElement; raf: number; y: number };

export function useReorder({ ids, enabled, onMove, container, labels }: {
  ids: string[]; enabled: boolean; container: RefObject<HTMLElement | null>;
  /** `to` is the item's new index once it's removed from its old place (splice semantics). */
  onMove: (id: string, to: number) => void;
  labels: (id: string) => string;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [lifted, setLifted] = useState<{ id: string; at: number } | null>(null);
  const [before, setBefore] = useState<string | null | undefined>(undefined); // drop indicator: before this id, or null = at the end
  const [status, setStatus] = useState("");
  const drag = useRef<Drag | null>(null);
  const latest = useRef({ ids, onMove }); latest.current = { ids, onMove };

  const rows = () => [...(container.current?.querySelectorAll<HTMLElement>("[data-reorder-id]") ?? [])];
  const refocus = (id: string) => requestAnimationFrame(() => container.current?.querySelector<HTMLElement>(`[data-reorder-handle="${CSS.escape(id)}"]`)?.focus());
  const indicatorFor = (id: string, to: number) => { const rest = latest.current.ids.filter(x => x !== id); return rest[to] ?? null; };

  const targetAt = (clientY: number, id: string) => {
    let to = 0;
    for (const el of rows()) {
      if (el.dataset.reorderId === id) continue;
      const r = el.getBoundingClientRect();
      if (clientY > r.top + r.height / 2) to++;
    }
    return to;
  };
  const scrollParent = (el: HTMLElement | null): HTMLElement | null => {
    for (let n = el?.parentElement; n; n = n.parentElement) { const o = getComputedStyle(n).overflowY; if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n; }
    return null;
  };

  const end = useCallback((commit: boolean) => {
    const d = drag.current;
    if (!d) return;
    cancelAnimationFrame(d.raf);
    d.el.style.transform = ""; d.el.classList.remove("is-lifting");
    drag.current = null; setDragging(null); setBefore(undefined);
    if (!commit || !d.active) return;
    const to = targetAt(d.y, d.id), from = latest.current.ids.indexOf(d.id);
    if (to !== from) { latest.current.onMove(d.id, to); setStatus(`${labels(d.id)} moved to position ${to + 1} of ${latest.current.ids.length}.`); }
    refocus(d.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labels]);
  useEffect(() => () => { if (drag.current) cancelAnimationFrame(drag.current.raf); }, []);

  const handle = (id: string) => ({
    "data-reorder-handle": id,
    "aria-label": enabled ? `Move ${labels(id)}` : `Clear search and filters to reorder ${labels(id)}`,
    "aria-describedby": "reorder-help",
    "aria-pressed": lifted?.id === id ? true : undefined,
    disabled: !enabled,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!enabled || e.button !== 0) return;
      const el = (e.currentTarget.closest("[data-reorder-id]") as HTMLElement | null);
      if (!el) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      drag.current = { id, pointer: e.pointerId, startY: e.clientY, grabOffset: e.clientY - r.top, active: false, el, raf: 0, y: e.clientY };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.pointer !== e.pointerId) return;
      d.y = e.clientY;
      if (!d.active) {
        if (Math.abs(e.clientY - d.startY) < 4) return;
        d.active = true; setDragging(d.id); d.el.classList.add("is-lifting");
        const tick = () => {
          const cur = drag.current; if (!cur) return;
          // Follow the pointer, and scroll when it nears an edge, so a long list can be crossed in one drag.
          const box = scrollParent(cur.el), top = box ? box.getBoundingClientRect().top : 0, bottom = box ? box.getBoundingClientRect().bottom : innerHeight;
          const edge = 56, speed = cur.y < top + edge ? -Math.ceil((top + edge - cur.y) / 4) : cur.y > bottom - edge ? Math.ceil((cur.y - bottom + edge) / 4) : 0;
          if (speed) { if (box) box.scrollTop += speed; else scrollBy(0, speed); }
          cur.el.style.transform = "";
          const natural = cur.el.getBoundingClientRect().top;
          cur.el.style.transform = `translateY(${cur.y - cur.grabOffset - natural}px)`;
          const to = targetAt(cur.y, cur.id);
          const mark = indicatorFor(cur.id, to);
          setBefore(prev => prev === mark ? prev : mark);
          cur.raf = requestAnimationFrame(tick);
        };
        d.raf = requestAnimationFrame(tick);
      }
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => { if (drag.current?.pointer === e.pointerId) end(true); },
    onPointerCancel: () => end(false),
    onLostPointerCapture: () => { if (drag.current) end(true); },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (!enabled) return;
      const list = latest.current.ids, from = list.indexOf(id);
      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const to = Math.max(0, Math.min(list.length - 1, from + (e.key === "ArrowUp" ? -1 : 1)));
        if (to !== from) { latest.current.onMove(id, to); setStatus(`${labels(id)} moved to position ${to + 1} of ${list.length}.`); refocus(id); }
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (lifted?.id === id) {
          setLifted(null); setBefore(undefined);
          if (lifted.at !== from) { latest.current.onMove(id, lifted.at); refocus(id); }
          setStatus(`${labels(id)} dropped at position ${lifted.at + 1} of ${list.length}.`);
        } else {
          setLifted({ id, at: from }); setBefore(indicatorFor(id, from));
          setStatus(`Picked up ${labels(id)}, position ${from + 1} of ${list.length}. Use the arrow keys to move it, Space to drop, Escape to cancel.`);
        }
        return;
      }
      if (lifted?.id === id && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        const at = Math.max(0, Math.min(list.length - 1, lifted.at + (e.key === "ArrowUp" ? -1 : 1)));
        setLifted({ id, at }); setBefore(indicatorFor(id, at)); setStatus(`Position ${at + 1} of ${list.length}.`);
        return;
      }
      if (lifted?.id === id && e.key === "Escape") { e.preventDefault(); setLifted(null); setBefore(undefined); setStatus(`Move cancelled. ${labels(id)} stays at position ${from + 1}.`); }
    },
    onBlur: () => { if (lifted?.id === id) { setLifted(null); setBefore(undefined); } },
  });

  /** Class names for a row: the drop line before it, the row being dragged, the row picked up by keyboard. */
  const rowClass = (id: string) => [before === id ? "drop-before" : "", dragging === id ? "is-dragging" : "", lifted?.id === id ? "is-lifted" : ""].filter(Boolean).join(" ");
  return { handle, rowClass, dropAtEnd: before === null, dragging, status };
}

/** Screen-reader instructions shared by every reorder handle on the page. */
export function ReorderHelp() {
  return <p id="reorder-help" className="sr-only">Drag to reorder, or press Space to pick up, the arrow keys to move, and Space to drop. Alt with the arrow keys moves one place.</p>;
}

/** Move one item and save the new order. The screen changes at once; the save replays the same move on the latest list
 *  (relative to the item it now follows), so an item added meanwhile doesn't undo it. */
export function useMoveItem(ctx: SetupCtx) {
  const { apply, track, current } = ctx;
  return useCallback((id: string, to: number) => {
    // `after`: undefined = use the index `to`; null = first; otherwise directly after that item (if it's still there).
    const reorder = (d: Data, after: string | null | undefined) => {
      const from = d.items.findIndex(i => i.id === id);
      if (from < 0) return null;
      const ids = d.items.map(i => i.id).filter(x => x !== id);
      const anchor = after === undefined || after === null ? -1 : ids.indexOf(after);
      const at = after === undefined ? Math.max(0, Math.min(ids.length, to)) : after === null ? 0 : anchor < 0 ? from : anchor + 1;
      ids.splice(at, 0, id);
      return ids;
    };
    let after: string | null = null;
    apply(d => {
      const ids = reorder(d, undefined);
      if (!ids) return d;
      const at = ids.indexOf(id); after = at === 0 ? null : ids[at - 1];
      const byId = new Map(d.items.map(i => [i.id, i]));
      return { ...d, items: ids.map((x, position) => ({ ...byId.get(x)!, position })) };
    });
    void track(async () => {
      const order = reorder(current(), after);
      if (!order) return { ok: true };
      const r = await api("POST", `/api/v1/host/events/${current().event.id}/items/order`, { order });
      return { ok: r.ok, message: r.ok ? undefined : errorText(r) };
    });
  }, [apply, track, current]);
}
