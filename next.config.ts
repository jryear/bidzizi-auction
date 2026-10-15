import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["@sentry/nextjs", "@sentry/core"],
  // The dev badge sits over the attendee tab bar and intercepts taps in local review.
  devIndicators: false,
};

export default withSentryConfig(nextConfig, {
  silent: true, telemetry: false,
  sourcemaps: { disable: true },
  buildTimeInstrumentation: false,
  webpack: { autoInstrumentServerFunctions: false, autoInstrumentMiddleware: false,
    autoInstrumentAppDirectory: false, automaticVercelMonitors: false },
});
