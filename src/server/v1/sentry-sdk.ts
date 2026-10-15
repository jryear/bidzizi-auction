// Imported only by Node instrumentation/the server-only alerts adapter.
import * as Sentry from "@sentry/nextjs";
import { createEnvelope, serializeEnvelope, type Envelope, type ErrorEvent, type Transport } from "@sentry/core";
import type { AlertConfig, AlertEvent } from "./alert-core";

export function createSentryDelivery(config: AlertConfig, sendFetch: typeof fetch = fetch) {
  const allowed = new Map<string, { event: AlertEvent; signal: AbortSignal; response?: Response }>();
  const pending = new Set<Promise<unknown>>();
  const client = Sentry.init({
    dsn: config.dsn ?? `https://${"a".repeat(32)}@o0.ingest.sentry.io/1`,
    environment: config.environment, release: config.release,
    defaultIntegrations: false, enableOpenTelemetrySetup: false,
    tracesSampleRate: 0, sendClientReports: false, maxBreadcrumbs: 0,
    beforeSendLog: () => null, beforeSendMetric: () => null,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
      graphQL: { document: false, variables: false }, genAI: { inputs: false, outputs: false },
      databaseQueryData: false, queues: false, stackFrameVariables: false, frameContextLines: 0 },
    debug: false,
    // Scope, framework and SDK enrichment are discarded, including raw errors/stack traces.
    beforeSend: event => {
      const entry = allowed.get(event.event_id ?? "");
      return entry ? { ...structuredClone(entry.event), type: undefined } satisfies ErrorEvent : null;
    },
    transport: (): Transport => ({
      send: (envelope: Envelope) => {
        const id = envelope[0].event_id;
        const entry = typeof id === "string" ? allowed.get(id) : undefined;
        if (!entry || envelope[1].length !== 1 || envelope[1][0][0].type !== "event") return Promise.resolve({ statusCode: 400 });
        const work = (async () => {
          // SDK serialization; replace enriched envelope metadata/payload with the exact allowlist.
          // In particular, never include the DSN, trace context or SDK-added personal data.
          const serialized = serializeEnvelope(createEnvelope(
            { event_id: id, sent_at: new Date().toISOString() }, [[{ type: "event" }, structuredClone(entry.event)]],
          ));
          const response = await sendFetch(config.endpoint, { method: "POST", redirect: "error", signal: entry.signal,
            headers: { "content-type": "application/x-sentry-envelope", ...(config.auth ? { "X-Sentry-Auth": config.auth } : {}) },
            body: typeof serialized === "string" ? serialized : new TextDecoder().decode(serialized) });
          await response.body?.cancel().catch(() => {});
          entry.response = new Response(null, { status: response.status, headers: response.headers });
          return { statusCode: response.status };
        })();
        pending.add(work);
        void work.then(() => pending.delete(work), () => pending.delete(work));
        return work;
      },
      flush: async () => { await Promise.allSettled([...pending]); return true; },
    }),
  });
  if (!client) throw new Error("Sentry initialization unavailable");
  return async (event: AlertEvent, signal: AbortSignal): Promise<Response> => {
    const entry = { event: structuredClone(event), signal, response: undefined as Response | undefined };
    allowed.set(event.event_id, entry);
    try {
      client.captureEvent(event);
      await client.flush(2000);
      if (!entry.response) throw new Error("Sentry delivery unavailable");
      return entry.response;
    } finally { allowed.delete(event.event_id); }
  };
}
