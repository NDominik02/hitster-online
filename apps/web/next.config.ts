import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables testing from a phone on the same Wi-Fi during local dev — Next.js
  // blocks HMR/dev-resource requests from non-localhost origins by default.
  allowedDevOrigins: ["192.168.0.123"],
};

export default nextConfig;
