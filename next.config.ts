import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parsers used by the upload pipeline run in Node, unbundled (sharp
  // shrinks big photos; it has native parts).
  serverExternalPackages: ["unpdf", "mammoth", "sharp"],
  // YouTube thumbnails, if next/image is used for video suggestions.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
  },
  // Basic hardening for every page. No CSP yet: the no-flash theme script is
  // inline.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
