import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // In the combined Docker deployment, the Express backend runs alongside
  // this app in the same container on a fixed internal port. The browser
  // calls NEXT_PUBLIC_API_URL=/backend/... (same-origin), and this rewrite
  // forwards it internally — no separate public backend URL is needed.
  // Harmless locally too: local dev sets NEXT_PUBLIC_API_URL to an absolute
  // localhost:8000 URL directly, so this rewrite path is simply unused.
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: "http://localhost:8000/:path*",
      },
    ];
  },
};

export default nextConfig;
