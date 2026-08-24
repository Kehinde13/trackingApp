import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: {
      ignore: [
        /^\/track\//,
        /^\/api\/public\/track\//,
        /^\/api\/auth\//,
        /^\/api\/webhooks\//,
      ],
    },
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      { key: "X-Frame-Options", value: "DENY" },
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/auth/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/api/webhooks/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      { source: "/api/public/track/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      { source: "/track/:path*", headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Robots-Tag", value: "noindex, nofollow" },
      ] },
    ];
  },
};

export default nextConfig;
