import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    typedRoutes: true,
  },
  productionBrowserSourceMaps: true,
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
