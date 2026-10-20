import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const createNextConfig = (phase) => ({
  eslint: {
    ignoreDuringBuilds: true,
  },
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL || "http://localhost:4000/api"}/:path*`,
      },
    ];
  },
});

export default createNextConfig;
