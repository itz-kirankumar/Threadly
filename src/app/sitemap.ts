import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.gothreadly.live";
  const now = new Date();

  const routes = ["", "/demo", "/security", "/privacy", "/terms"];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" || route === "/demo" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/demo" ? 0.9 : 0.5,
  }));
}
