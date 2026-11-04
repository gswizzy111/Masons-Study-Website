import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parsers used by the upload pipeline run in Node, unbundled.
  serverExternalPackages: ["unpdf", "mammoth"],
  // YouTube thumbnails, if next/image is used for video suggestions.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "i.ytimg.com", pathname: "/vi/**" }],
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
