import "server-only";
import { alertConfig } from "./server/v1/alert-core";
import { createSentryDelivery } from "./server/v1/sentry-sdk";

// Next can load instrumentation and route code in separate bundles in one process.
// Share the client/allowlist transport across those bundles, not just one module instance.
const state = globalThis as typeof globalThis & {
  __bidziziSentry?: { delivery?: ReturnType<typeof createSentryDelivery> };
};
export function initializeSentry() {
  if (!state.__bidziziSentry) {
    const config = alertConfig(process.env);
    state.__bidziziSentry = { delivery: config ? createSentryDelivery(config) : undefined };
  }
  return state.__bidziziSentry.delivery;
}
