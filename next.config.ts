import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.evetech.net",
        pathname: "/**",
      },
    ],
  },
  reactCompiler: true,
};

export default nextConfig;
