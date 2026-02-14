import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js config options here
};

// Only wrap with Serwist in production builds (uses webpack).
// In dev, Next.js 16 defaults to Turbopack which conflicts with Serwist's webpack plugin.
let config: NextConfig;
if (process.env.NODE_ENV === "production") {
  const withSerwistInit = require("@serwist/next").default;
  const withSerwist = withSerwistInit({
    swSrc: "src/app/sw.ts",
    swDest: "public/sw.js",
  });
  config = withSerwist(nextConfig);
} else {
  config = nextConfig;
}

export default config;
