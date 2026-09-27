import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Extra hostnames (comma-separated) allowed to use dev resources, e.g. over Tailscale.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
}

export default nextConfig
