import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Parsers used by the upload pipeline run in Node, unbundled.
  serverExternalPackages: ["unpdf", "mammoth"],
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
