import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://threadly.app";
  const now = new Date();

  const routes = [
    "",
    "/about",
    "/mission",
    "/playbook",
    "/case-studies",
    "/careers",
    "/ai-engine",
    "/signal-radar",
    "/beta-collective",
    "/security",
    "/privacy",
    "/terms",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" || route === "/signal-radar" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/signal-radar" || route === "/ai-engine" ? 0.9 : 0.7,
  }));
}
