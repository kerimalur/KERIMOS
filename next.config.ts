import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ESLint ist in diesem Projekt nicht konfiguriert - Build nicht daran hängen lassen.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
