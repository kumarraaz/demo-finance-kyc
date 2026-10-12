import type { NextConfig } from "next";

// Page CSP (with a per-request nonce) is set in src/proxy.ts.
const baseHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    // The application list used to live at /admin. Old bookmarks such as /admin?status=closed&q=ann keep working:
    // Next passes the original query string through to the destination.
    return ["q", "status", "page"].map((key) => ({
      source: "/admin",
      has: [{ type: "query" as const, key }],
      destination: "/admin/applications",
      permanent: false,
    }));
  },
  async headers() {
    return [
      {
        // Everything except immutable build assets, which must stay cacheable.
        source: "/((?!_next/static|_next/image).*)",
        headers: [...baseHeaders, { key: "Cache-Control", value: "no-store" }],
      },
      {
        // API responses are JSON: nothing in them should ever load or run.
        source: "/api/:path*",
        headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }],
      },
    ];
  },
};

export default nextConfig;
