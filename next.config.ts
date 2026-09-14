import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@": path.resolve(__dirname),
    },
  },
  allowedDevOrigins: ["192.168.1.*", "10.58.212.*"],
};

export default nextConfig;
