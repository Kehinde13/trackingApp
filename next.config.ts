import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: {
    incomingRequests: {
      ignore: [/^\/track\//, /^\/api\/public\/track\//],
    },
  },
  async headers() {
    return [{ source: "/track/:path*", headers: [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }];
  },
};

export default nextConfig;
