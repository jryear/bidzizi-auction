import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  // The dev badge sits over the attendee tab bar and intercepts taps in local review.
  devIndicators: false,
};

export default nextConfig;
