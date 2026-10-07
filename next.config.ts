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
  async headers() {
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (process.env.VERCEL_ENV === "production") {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
