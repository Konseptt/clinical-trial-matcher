import type { MetadataRoute } from "next";
import { SITE_URL, absoluteUrl } from "@/lib/site";

// One "*" group covers every crawler (search and AI). Per-bot groups with the
// same rules were a no-op; add one only when a bot needs different rules.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/results", "/profile", "/sign-in", "/api/"] }],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
