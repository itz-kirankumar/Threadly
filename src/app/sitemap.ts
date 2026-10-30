import type { MetadataRoute } from "next";
import { DOC_PAGES } from "@/lib/docs/content";
import { publishedPosts } from "@/lib/blog/content";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.gothreadly.live";
  const now = new Date();

  const routes = ["", "/pricing", "/docs", "/blog", "/security", "/privacy", "/terms"];

  const staticEntries: MetadataRoute.Sitemap = routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: now,
    changeFrequency: route === "" ? "daily" : "weekly",
    priority: route === "" ? 1.0 : route === "/pricing" ? 0.9 : 0.5,
  }));

  const docEntries: MetadataRoute.Sitemap = DOC_PAGES.map((page) => ({
    url: `${baseUrl}/docs/${page.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  const blogEntries: MetadataRoute.Sitemap = publishedPosts().map((post) => ({
    url: `${baseUrl}/blog/${post.slug}`,
    lastModified: new Date(`${post.date}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticEntries, ...docEntries, ...blogEntries];
}
