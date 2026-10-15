import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeSentry } = await import("./sentry.server.config");
    initializeSentry();
  }
}

export const onRequestError: Instrumentation.onRequestError = async () => {
  // Do not capture error, request or context: they may contain credentials or personal data.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { frameworkAlert } = await import("./server/v1/alerts");
    await frameworkAlert();
  }
};
