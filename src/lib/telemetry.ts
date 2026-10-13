"use client";
// Reports what devices people use and what goes wrong on them, so staff see a stuck guest within seconds.
// Never blocks the page: everything here is best-effort, capped and deduplicated.

type Kind = "device" | "error" | "health";
type Report = { kind: Kind; check?: string; message?: string; detail?: string; route?: string; eventId?: string };
type Target = { url: string; eventId?: string };

let target: Target | null = null;
const owners = new Map<symbol, Target>();
const sent = new Set<string>();
let budget = 20;

/** A random id remembered on this device (hashed by the server). Counts devices; identifies nobody. */
function deviceId(): string {
  const make = () => (crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c => (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16)));
  try {
    let v = localStorage.getItem("bz_device");
    if (!v || !/^[0-9a-f-]{36}$/.test(v)) { v = make(); localStorage.setItem("bz_device", v); }
    return v;
  } catch { return (window as unknown as { __bzDevice?: string }).__bzDevice ??= make(); }
}
const viewport = () => `${Math.round(innerWidth)}x${Math.round(innerHeight)}@${Math.round((devicePixelRatio || 1) * 100) / 100}`;

export function report(r: Report): void {
  if (!target || (budget <= 0 && r.kind !== "device")) return;
  const key = `${r.kind}|${r.check ?? ""}|${(r.message ?? "").slice(0, 120)}`;
  if (r.kind !== "device" && sent.has(key)) return;
  sent.add(key); if (r.kind !== "device") budget--;
  const body = JSON.stringify({ deviceId: deviceId(), viewport: viewport(), route: (r.route ?? location.pathname).slice(0, 200),
    kind: r.kind, check: r.check, message: r.message?.slice(0, 500), detail: r.detail?.slice(0, 2000), eventId: target.eventId ?? r.eventId });
  try {
    fetch(target.url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true, credentials: "same-origin" }).catch(() => {});
  } catch {
    try { navigator.sendBeacon?.(target.url, body); } catch { /* nothing more to do */ }
  }
}

const trimStack = (stack?: string) => (stack ?? "").split("\n").slice(0, 8).map(l => l.trim().slice(0, 200)).join("\n");

/** Start reporting for this page: the device once, then uncaught errors and rejected promises. Idempotent. */
export function startReporting(t: Target): () => void {
  const owner = Symbol(), previous = target;
  owners.set(owner, t); target = t;
  if (previous?.url !== t.url) { sent.clear(); budget = 20; }
  report({ kind: "device" });
  const onError = (e: ErrorEvent) => {
    // Script errors from other origins carry no detail; they're noise.
    if (!e.message || e.message === "Script error.") return;
    report({ kind: "error", message: e.message, detail: trimStack(e.error?.stack) || `${e.filename}:${e.lineno}:${e.colno}` });
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const r = e.reason as { message?: string; stack?: string; name?: string } | undefined;
    // Network failures are handled (and shown) by the app itself.
    if (r?.name === "AbortError" || r?.message === "You're offline or the connection dropped.") return;
    report({ kind: "error", message: `Unhandled: ${r?.message ?? String(e.reason)}`.slice(0, 500), detail: trimStack(r?.stack) });
  };
  addEventListener("error", onError);
  addEventListener("unhandledrejection", onRejection);
  const heartbeat = setInterval(() => { if (document.visibilityState === "visible") report({ kind: "device" }); }, 60_000);
  return () => {
    clearInterval(heartbeat); removeEventListener("error", onError); removeEventListener("unhandledrejection", onRejection);
    owners.delete(owner); target = [...owners.values()].at(-1) ?? null;
  };
}

/** Is this element on screen and would a tap at its centre reach it? Returns why not, or null when it's fine. */
export function tappable(el: Element | null): string | null {
  if (!el) return "missing";
  const r = el.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return `too small (${Math.round(r.width)}x${Math.round(r.height)})`;
  if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return `off screen (top ${Math.round(r.top)}, viewport ${innerHeight})`;
  const cs = getComputedStyle(el);
  if (cs.visibility === "hidden" || Number(cs.opacity) < 0.1 || cs.pointerEvents === "none") return `not visible (${cs.visibility}, opacity ${cs.opacity})`;
  const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
  const hit = document.elementFromPoint(x, y);
  if (!hit) return "nothing at its centre";
  if (hit === el || el.contains(hit)) return null;
  const name = (n: Element) => `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ""}${typeof n.className === "string" && n.className ? `.${n.className.trim().split(/\s+/).slice(0, 3).join(".")}` : ""}`;
  return `covered by ${name(hit)}`;
}

/** After a critical surface opens, check its main button really can be tapped; report it if not. */
export function checkTappable(check: string, find: () => Element | null, delay = 700): () => void {
  const t = setTimeout(() => {
    const why = tappable(find());
    if (why) report({ kind: "health", check, message: `${check}: ${why}` });
  }, delay);
  return () => clearTimeout(t);
}
