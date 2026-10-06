import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const allowAll = ["/"];
  const disallow = ["/results"];

  return {
    rules: [
      // ── Standard search engines ──────────────────────────────────────────
      { userAgent: "*",            allow: allowAll, disallow },
      { userAgent: "Googlebot",    allow: allowAll, disallow },
      { userAgent: "Bingbot",      allow: allowAll, disallow },
      { userAgent: "Slurp",        allow: allowAll, disallow }, // Yahoo
      { userAgent: "DuckDuckBot",  allow: allowAll, disallow },
      { userAgent: "Baiduspider",  allow: allowAll, disallow },
      { userAgent: "YandexBot",    allow: allowAll, disallow },

      // ── AI / LLM crawlers ────────────────────────────────────────────────
      { userAgent: "GPTBot",           allow: allowAll, disallow }, // OpenAI
      { userAgent: "ChatGPT-User",     allow: allowAll, disallow }, // OpenAI browsing
      { userAgent: "OAI-SearchBot",    allow: allowAll, disallow }, // OpenAI search
      { userAgent: "anthropic-ai",     allow: allowAll, disallow }, // Anthropic / Claude
      { userAgent: "ClaudeBot",        allow: allowAll, disallow }, // Anthropic / Claude
      { userAgent: "Claude-Web",       allow: allowAll, disallow }, // Anthropic
      { userAgent: "Google-Extended",  allow: allowAll, disallow }, // Google Gemini training
      { userAgent: "Gemini",           allow: allowAll, disallow }, // Google Gemini
      { userAgent: "Googlebot-News",   allow: allowAll, disallow },
      { userAgent: "PerplexityBot",    allow: allowAll, disallow }, // Perplexity AI
      { userAgent: "YouBot",           allow: allowAll, disallow }, // You.com
      { userAgent: "cohere-ai",        allow: allowAll, disallow }, // Cohere
      { userAgent: "Meta-ExternalAgent", allow: allowAll, disallow }, // Meta AI
      { userAgent: "Meta-ExternalFetcher", allow: allowAll, disallow },
      { userAgent: "FacebookBot",      allow: allowAll, disallow },
      { userAgent: "Applebot",         allow: allowAll, disallow }, // Apple Siri / Spotlight
      { userAgent: "Applebot-Extended",allow: allowAll, disallow }, // Apple AI training
      { userAgent: "Amazonbot",        allow: allowAll, disallow }, // Amazon Alexa/AI
      { userAgent: "Bytespider",       allow: allowAll, disallow }, // ByteDance / TikTok AI
      { userAgent: "PetalBot",         allow: allowAll, disallow }, // Huawei AI
      { userAgent: "AI2Bot",           allow: allowAll, disallow }, // Allen Institute AI
      { userAgent: "Diffbot",          allow: allowAll, disallow }, // Diffbot AI
      { userAgent: "facebookexternalhit", allow: allowAll, disallow },
      { userAgent: "Twitterbot",       allow: allowAll, disallow },
      { userAgent: "LinkedInBot",      allow: allowAll, disallow },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: "https://clinicaltrial.world",
  };
}
