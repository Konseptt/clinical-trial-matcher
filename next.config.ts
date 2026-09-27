import type { NextConfig } from "next";

const indexNowKey = process.env.INDEXNOW_KEY?.trim() ?? "";
const indexNowRewrite =
  /^[A-Za-z0-9]{8,128}$/.test(indexNowKey)
    ? [{ source: `/${indexNowKey}.txt`, destination: "/api/indexnow-key" }]
    : [];

const nextConfig: NextConfig = {
  async rewrites() {
    return indexNowRewrite;
  },
};

export default nextConfig;
