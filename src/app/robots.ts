import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.gothreadly.live";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/portal/"],
      },
      {
        userAgent: ["GPTBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Amazonbot"],
        allow: ["/", "/pricing", "/docs", "/blog", "/security", "/terms", "/privacy"],
        disallow: ["/api/", "/portal/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
