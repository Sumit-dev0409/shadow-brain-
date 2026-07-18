import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin the workspace root: a stray package-lock.json in the parent
  // directory otherwise makes Turbopack infer the wrong root and fail
  // to resolve modules in the React Client Manifest.
  turbopack: {
    root: path.resolve(__dirname),
  },
  // `next dev` binds its dev-only origin check to "localhost" regardless of
  // the LAN address it's reachable on, so requests (including the HMR
  // websocket) from another device on the network get blocked as
  // cross-origin. Allow the local LAN.
  allowedDevOrigins: ["192.168.1.*"],
};

export default nextConfig;
