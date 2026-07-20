import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": path.resolve(__dirname),
    };
    return config;
  },
  // `next dev` binds its dev-only origin check to "localhost" regardless of
  // the LAN address it's reachable on, so requests (including the HMR
  // websocket) from another device on the network get blocked as
  // cross-origin. Allow the local LAN.
  allowedDevOrigins: ["192.168.1.*"],
};

export default nextConfig;
