import "server-only";
import { after } from "next/server";
import { alertConfig, createAlertSender, type AlertInput } from "./alert-core";

let sender: ReturnType<typeof createAlertSender> | undefined;
const getSender = () => sender ??= createAlertSender(alertConfig(process.env), {
  log: notice => console.info("BidZizi alert " + JSON.stringify(notice)),
});

/** Call only after the application transaction settles. Network work starts after response. */
export function queueAlert(input: AlertInput): string | null {
  try {
    const job = getSender().prepare(input);
    if (!job) return null;
    try { after(job.run); } catch { job.cancel(); return null; }
    return job.eventId;
  } catch { return null; }
}

/** Next's onRequestError explicitly awaits asynchronous instrumentation work. */
export async function frameworkAlert(): Promise<void> {
  try { await getSender().prepare({ category: "server-failure", check: "framework-request" })?.run(); } catch { /* safe failure */ }
}
