// Pure transport core. Used only by the server-only adapter; never import from client code.
import { randomUUID } from "node:crypto";

export type AlertInput = { category: "server-failure" | "guest-blocked"; check: string; browser?: string };
export type AlertConfig = { endpoint: string; auth?: string; environment: "local" | "staging" | "production"; release: string };
const CHECKS = new Set(["api-request", "framework-request", "client-error", "app-not-started", "error-boundary", "bid-sheet"]);
const BROWSERS = new Set(["Safari", "Chrome", "Firefox", "Edge", "Opera", "Samsung Internet", "Android WebView", "iOS WebView"]);

export function alertConfig(env: Record<string, string | undefined>): AlertConfig | null {
  const local = env.BIDZIZI_APP_MODE === "local" && !env.VERCEL && /^http:\/\/127\.0\.0\.1:\d+$/.test(env.APP_ORIGIN ?? "");
  const origin = env.APP_ORIGIN;
  const environment = local ? "local" : env.VERCEL === "1" && env.BIDZIZI_APP_MODE === "production"
    ? origin === "https://staging.bidzizi.com" ? "staging" : origin === "https://app.bidzizi.com" ? "production" : null : null;
  if (!environment) return null;
  const rawRelease = env.VERCEL_GIT_COMMIT_SHA ?? env.VERCEL_DEPLOYMENT_ID ?? "";
  const release = local ? "local" : /^(?:[a-f0-9]{40}|dpl_[A-Za-z0-9]{10,80})$/.test(rawRelease) ? rawRelease : "unidentified-deployment";
  try {
    if (env.BIDZIZI_ALERT_TEST_RECEIVER) {
      if (!local) return null;
      const u = new URL(env.BIDZIZI_ALERT_TEST_RECEIVER);
      if (u.protocol !== "http:" || u.hostname !== "127.0.0.1" || Number(u.port) <= 1024 ||
        u.pathname !== "/envelope" || u.search || u.hash || u.username || u.password) return null;
      return { endpoint: u.toString(), environment, release };
    }
    if (!env.BIDZIZI_SENTRY_DSN || local) return null; // local checks never contact the real provider
    const u = new URL(env.BIDZIZI_SENTRY_DSN);
    if (u.protocol !== "https:" || !/^o\d+\.ingest(?:\.(?:us|de))?\.sentry\.io$/.test(u.hostname) ||
      !/^[a-f0-9]{32}$/.test(u.username) || u.password || u.port || !/^\/[1-9]\d*$/.test(u.pathname) || u.search || u.hash) return null;
    return { endpoint: `https://${u.hostname}/api${u.pathname}/envelope/`,
      auth: `Sentry sentry_version=7, sentry_client=bidzizi-readiness/1.0, sentry_key=${u.username}`, environment, release };
  } catch { return null; }
}

type Notice = { status: "accepted" | "failed" | "suppressed"; reason?: string; eventId: string; category: string; check: string; occurredAt: string; at: string; providerDate?: string };
export function createAlertSender(config: AlertConfig | null, deps: {
  fetch?: typeof fetch; now?: () => number; id?: () => string; log?: (notice: Notice) => void;
  ttlMs?: number; maxEntries?: number; maxPending?: number; timeoutMs?: number;
} = {}) {
  const sendFetch = deps.fetch ?? fetch, now = deps.now ?? Date.now, makeId = deps.id ?? (() => randomUUID().replace(/-/g, ""));
  const log = deps.log ?? (() => {}), ttl = deps.ttlMs ?? 60_000, maxEntries = deps.maxEntries ?? 256;
  const maxPending = deps.maxPending ?? 4, timeout = deps.timeoutMs ?? 1500;
  const recent = new Map<string, { at: number; id: string }>();
  let pending = 0, providerBackoffUntil = 0;
  const safeLog = (notice: Notice) => { try { log(notice); } catch { /* never recurse or change an application outcome */ } };
  function prepare(input: AlertInput) {
    if (!config || !["server-failure", "guest-blocked"].includes(input.category) || !CHECKS.has(input.check)) return null;
    if (input.category === "server-failure" ? !["api-request", "framework-request"].includes(input.check) : ["api-request", "framework-request"].includes(input.check)) return null;
    const at = now(), key = `${input.category}|${input.check}`;
    for (const [k, v] of recent) if (at - v.at >= ttl) recent.delete(k);
    if (recent.has(key) || pending >= maxPending || at < providerBackoffUntil) return null;
    while (recent.size >= maxEntries) recent.delete(recent.keys().next().value!);
    const eventId = makeId();
    if (!/^[a-f0-9]{32}$/.test(eventId)) return null;
    recent.set(key, { at, id: eventId }); pending++;
    const occurredAt = new Date(at).toISOString();
    // Construct every field anew. Never spread caller data or include an Error object.
    const event = { event_id: eventId, timestamp: at / 1000, platform: "node", level: "error", logger: "bidzizi.readiness",
      environment: config.environment, release: config.release,
      message: `BidZizi ${input.category}: ${input.check} [${eventId}]`,
      fingerprint: ["bidzizi-readiness", config.environment, input.category, input.check],
      tags: { category: input.category, check: input.check, browser: BROWSERS.has(input.browser ?? "") ? input.browser : "unknown" },
      extra: { occurredAt, correlationId: eventId } };
    let completed = false, running = false;
    function cancel() { if (!completed && !running) { completed = true; pending--; if (recent.get(key)?.id === eventId) recent.delete(key); } }
    async function run() {
      if (completed || running) return;
      running = true;
      let accepted = false;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const payload = JSON.stringify(event);
          const envelope = JSON.stringify({ event_id: eventId, sent_at: new Date(now()).toISOString() }) + "\n" +
            JSON.stringify({ type: "event", length: Buffer.byteLength(payload), content_type: "application/json" }) + "\n" + payload + "\n";
          let response: Response;
          try {
            response = await sendFetch(config!.endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(timeout),
              headers: { "content-type": "application/x-sentry-envelope", ...(config!.auth ? { "X-Sentry-Auth": config!.auth } : {}) }, body: envelope });
          } catch { if (attempt === 0) continue; break; }
          await response.body?.cancel().catch(() => {}); // never log or retain provider body
          if (response.ok) {
            accepted = true;
            const date = response.headers.get("date");
            safeLog({ status: "accepted", eventId, category: input.category, check: input.check, occurredAt, at: new Date(now()).toISOString(),
              ...(date && Number.isFinite(Date.parse(date)) ? { providerDate: new Date(date).toISOString() } : {}) });
            break;
          }
          if (response.status === 429) { providerBackoffUntil = now() + 60_000; break; }
          if (response.status < 500) break;
        }
        if (!accepted) {
          if (recent.get(key)?.id === eventId) recent.delete(key); // a later incident may retry
          safeLog({ status: "failed", reason: "provider-delivery-failed", eventId, category: input.category, check: input.check, occurredAt, at: new Date(now()).toISOString() });
        }
      } catch {
        if (recent.get(key)?.id === eventId) recent.delete(key);
        safeLog({ status: "failed", reason: "dispatch-failed", eventId, category: input.category, check: input.check, occurredAt, at: new Date(now()).toISOString() });
      } finally { completed = true; pending--; }
    }
    return { eventId, occurredAt, run, cancel };
  }
  return { prepare, stats: () => ({ recent: recent.size, pending }) };
}
