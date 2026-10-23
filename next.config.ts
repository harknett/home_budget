import type { NextConfig } from "next";

/**
 * Response headers.
 *
 * The Content-Security-Policy is deliberately NOT here: it needs a fresh
 * nonce per request so Next's inline scripts can run, which only middleware
 * can do. See `src/proxy.ts`. Everything below is the same on every response,
 * so it stays where it is cheapest.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: ["node:sqlite"],

  /**
   * Emit a self-contained server alongside the build.
   *
   * `.next/standalone/server.js` runs without node_modules, which is what the
   * systemd unit points at: the app directory can then be mounted read-only,
   * and unlike `next start` the standalone server honours HOSTNAME, so the
   * service binds loopback from the unit file rather than a wrapper script.
   */
  output: "standalone",

  // Nothing gained by telling every visitor which framework to look up.
  poweredByHeader: false,

  /**
   * Keep the log out of the build. Output file tracing follows `fs` usage
   * statically, which is enough to sweep a live .db into the standalone
   * output and carry a stale copy onto the server.
   */
  outputFileTracingExcludes: {
    "/*": ["data/**/*", "test/**/*", "deploy/**/*", "scripts/**/*"],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      {
        // A budget is nobody else's to cache.
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, private" }],
      },
    ];
  },
};

export default nextConfig;
