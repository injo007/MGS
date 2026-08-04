import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["postgres"],
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
