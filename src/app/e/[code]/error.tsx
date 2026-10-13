"use client";
import { useEffect } from "react";
import { report, startReporting } from "../../../lib/telemetry";
export default function GuestError({ error, reset }: { error: Error; reset: () => void }) {
  const code = typeof location === "undefined" ? "" : location.pathname.split("/")[2] ?? "";
  useEffect(() => { const stop = startReporting({ url: `/api/v1/e/${code}/telemetry` }); report({ kind: "health", check: "error-boundary", message: error.message }); return stop; }, [code, error]);
  return <main className="guest-recovery"><h1>Something went wrong.</h1><p>Your recorded bids are kept. You can continue in the simple version.</p><a href={`/e/${encodeURIComponent(code)}/simple`}>Continue in simple mode</a><button type="button" onClick={reset}>Try again</button></main>;
}
