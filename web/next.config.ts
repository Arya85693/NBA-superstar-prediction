import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * The Next app lives in `web/`, but there is also a repo-root lockfile.
   * Pin tracing to this package so Next doesn't infer the repo root.
   */
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.espncdn.com",
        pathname: "/i/headshots/**",
      },
    ],
  },
};

export default nextConfig;
