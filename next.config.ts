import type { NextConfig } from "next";
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";

// --- Auto-Generate JWT Secret Logic ---
const resolveSecret = () => {
  // 1. Environment Variable (Priority)
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  // 2. Fallback to Memory-Only Secret (Dev/Temporary)
  // This ensures that if no secret is provided, we don't crash, 
  // but sessions will be invalidated on every server restart.
  // This is secure by default as it doesn't persist secrets to disk.
  console.warn("[NextConfig] ⚠️ No JWT_SECRET found. Generating temporary secret. Sessions will invalid on restart.");
  return randomBytes(32).toString("hex");
};

const jwtSecret = resolveSecret();

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: '1024mb',
    },
  },
  serverExternalPackages: ["better-sqlite3"],
  // In Next.js 15+, instrumentationHook is often stable or enabled by default if file exists.
  // Attempts to set it explicitly if types allow, otherwise reliant on auto-detection.
  // @ts-ignore

  env: {
    // Inject the resolved secret into the build/runtime environment
    JWT_SECRET: jwtSecret,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
