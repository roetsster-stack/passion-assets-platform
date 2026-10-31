import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security of the register is an architectural requirement (Concept Brief v2.1 §11, §15.2).
  // Baseline headers from day one. A nonce-based Content-Security-Policy comes with M1-02, when the
  // image host is known and the picture surfaces exist to test it against.
  poweredByHeader: false,
  // Pictures come only through the image door (/i/<id>), never through next/image: its optimiser
  // (/_next/image) sits outside the middleware's reach and would be an unauthenticated cache.
  images: { unoptimized: true },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },
};

export default nextConfig;
