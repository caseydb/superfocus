import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude functions directory from Next.js compilation
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      config.externals.push({
        "firebase-functions": "firebase-functions",
        "firebase-admin": "firebase-admin",
      });
    }
    return config;
  },
  // Exclude functions directory from TypeScript checking
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    typedRoutes: true,
  },
  // Enable source maps in production for better error tracking
  productionBrowserSourceMaps: true,
  // External packages for server components
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
