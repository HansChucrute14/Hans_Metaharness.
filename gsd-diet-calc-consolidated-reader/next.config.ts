import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // hide the floating Next.js dev indicator in the bottom corner
  devIndicators: false,
  // allow cross-origin requests from the Caddy gateway
  allowedDevOrigins: ["http://0.0.0.0:81", "http://21.0.12.130:3000", "http://0.0.0.0:3000"],
};

export default nextConfig;
