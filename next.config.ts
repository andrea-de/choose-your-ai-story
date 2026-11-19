import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev badge sits over the sheet controls at the foot of every page.
  devIndicators: false,
  // Extra hostnames (comma-separated) allowed to use dev resources, e.g. over Tailscale.
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
}

export default nextConfig
