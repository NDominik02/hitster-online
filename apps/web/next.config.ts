import type { NextConfig } from "next";

// Enables testing from a phone on the same Wi-Fi during local dev — Next.js
// blocks HMR/dev-resource requests from non-localhost origins by default.
// Read from .env.local (gitignored) instead of hardcoding one machine's LAN
// IP, so the repo works for local dev on any machine without editing.
const devLanIps = (process.env.DEV_LAN_IPS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devLanIps,
};

export default nextConfig;
