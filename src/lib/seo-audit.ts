import { fetchPublicPage, fetchPublicText } from "./outreach-website";

export type SeoAuditCheck = {
  id: string;
  label: string;
  status: "good" | "warning" | "issue" | "info";
  detail: string;
  recommendation: string;
  evidence?: string;
};

export type SeoAuditReport = {
  url: string;
  checkedAt: string;
  score: number;
  checks: SeoAuditCheck[];
  page: {
    title: string;
    description: string;
    wordCount: number;
    headings: number;
    schemaTypes: string[];
  };
};

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&#x([\da-f]+);/gi, (_, number: string) => String.fromCodePoint(parseInt(number, 16)));
}

function attr(tag: string | undefined, name: string) {
  if (!tag) return "";
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

function meta(html: string, key: string) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  const tag = tags.find((candidate) =>
    attr(candidate, "name").toLowerCase() === key.toLowerCase()
    || attr(candidate, "property").toLowerCase() === key.toLowerCase(),
  );
  return attr(tag, "content");
}

function check(
  id: string,
  label: string,
  status: SeoAuditCheck["status"],
  detail: string,
  recommendation: string,
  evidence?: string,
): SeoAuditCheck {
  return { id, label, status, detail, recommendation, ...(evidence ? { evidence } : {}) };
}

async function readSiteFile(url: URL) {
  try {
    const response = await fetchPublicText(url.toString());
    return { url: response.url, text: response.text, error: "" };
  } catch (error) {
    return { url: url.toString(), text: "", error: error instanceof Error ? error.message : "Unable to read this file." };
  }
}

export async function auditPublicWebsite(input: unknown): Promise<SeoAuditReport> {
  if (typeof input !== "string" || input.length > 2048) throw new Error("Enter a valid HTTPS website URL.");
  const normalized = /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`;
  const page = await fetchPublicPage(normalized);
  const html = page.html;
  const pageUrl = new URL(page.url);
  const title = decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, " ") ?? "").trim();
  const description = meta(html, "description");
  const canonicalTag = html.match(/<link\b(?=[^>]*\brel\s*=\s*(?:["'][^"']*\bcanonical\b[^"']*["']|canonical\b))[^>]*>/i)?.[0];
  const canonical = attr(canonicalTag, "href");
  const resolvedCanonical = canonical ? new URL(canonical, page.url) : null;
  const robots = meta(html, "robots").toLowerCase();
  const headings = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
  const h1Count = headings.filter((heading) => heading[1] === "1").length;
  const visibleText = decodeHtml(html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")).trim();
  const words = visibleText ? visibleText.split(/\s+/).length : 0;
  const imageTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const imagesWithoutAlt = imageTags.filter((tag) => attr(tag, "alt") === "").length;
  const schemaTypes = [...html.matchAll(/<script\b(?=[^>]*type\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((script) => {
      try {
        const parsed = JSON.parse(script[1]) as Record<string, unknown> | Array<Record<string, unknown>>;
        const records = Array.isArray(parsed) ? parsed : [parsed];
        return records.flatMap((record) => {
          const graph = Array.isArray(record["@graph"]) ? record["@graph"] as Record<string, unknown>[] : [record];
          return graph.flatMap((item) => {
            const type = item["@type"];
            return typeof type === "string" ? [type] : Array.isArray(type) ? type.filter((value): value is string => typeof value === "string") : [];
          });
        });
      } catch { return []; }
    });
  const language = attr(html.match(/<html\b[^>]*>/i)?.[0], "lang");
  const viewport = meta(html, "viewport");
  const openGraphTitle = meta(html, "og:title");
  const openGraphDescription = meta(html, "og:description");
  const origin = new URL(page.url);
  const robotsUrl = new URL("/robots.txt", origin);
  const sitemapUrl = new URL("/sitemap.xml", origin);
  const llmsUrl = new URL("/llms.txt", origin);
  const [robotsFile, defaultSitemap, llmsFile] = await Promise.all([
    readSiteFile(robotsUrl), readSiteFile(sitemapUrl), readSiteFile(llmsUrl),
  ]);
  const declaredSitemap = robotsFile.text.match(/^\s*sitemap\s*:\s*(\S+)/im)?.[1];
  let sitemapFile = defaultSitemap;
  if (declaredSitemap) {
    try {
      const declaredUrl = new URL(declaredSitemap, page.url);
      if (declaredUrl.hostname.toLowerCase() === origin.hostname.toLowerCase()) {
        sitemapFile = await readSiteFile(declaredUrl);
      }
    } catch { /* Keep the same-origin default sitemap result. */ }
  }

  const checks: SeoAuditCheck[] = [
    check("title", "Page title", title.length >= 20 && title.length <= 65 ? "good" : title ? "warning" : "issue",
      title ? `${title.length} characters` : "No page title was found.",
      title ? "Keep the title specific to this page and concise enough to display in search results." : "Add a unique, descriptive <title> element.", title || undefined),
    check("description", "Meta description", description.length >= 70 && description.length <= 170 ? "good" : description ? "warning" : "issue",
      description ? `${description.length} characters` : "No meta description was found.",
      description ? "Write a page-specific summary that clearly describes its value." : "Add a unique meta description that summarizes this page.", description || undefined),
    check("canonical", "Canonical URL", resolvedCanonical && resolvedCanonical.hostname === origin.hostname ? "good" : resolvedCanonical ? "warning" : "issue",
      resolvedCanonical ? resolvedCanonical.toString() : "No canonical link was found.",
      resolvedCanonical ? "Confirm the canonical points to the preferred version of this page." : "Add a canonical link to the preferred URL for this page.", canonical || undefined),
    check("headings", "Main heading", h1Count === 1 ? "good" : h1Count === 0 ? "issue" : "warning",
      h1Count === 1 ? "One H1 was found." : `${h1Count} H1 headings were found.`,
      h1Count === 1 ? "Use the H1 to state the page’s main topic, then organize detail with descriptive subheadings." : "Use one clear H1 for the page’s primary topic."),
    check("content", "Readable page content", words >= 300 ? "good" : words >= 100 ? "warning" : "issue",
      `${words.toLocaleString()} words of readable text detected.`,
      words >= 300 ? "Keep important facts, product details, and answers in crawlable page text." : "Add substantive, page-specific information that answers the visitor’s likely questions."),
    check("open-graph", "Social preview metadata", openGraphTitle && openGraphDescription ? "good" : "warning",
      openGraphTitle && openGraphDescription ? "Open Graph title and description are present." : "Open Graph title or description is missing.",
      "Add og:title and og:description so shared links have a clear, accurate preview.", [openGraphTitle, openGraphDescription].filter(Boolean).join(" · ") || undefined),
    check("schema", "Structured data", schemaTypes.length ? "good" : "warning",
      schemaTypes.length ? `JSON-LD types found: ${[...new Set(schemaTypes)].join(", ")}.` : "No valid JSON-LD schema was found.",
      "Add accurate Schema.org JSON-LD for the page type, organization, product, or FAQ where it applies.", schemaTypes.length ? [...new Set(schemaTypes)].join(", ") : undefined),
    check("indexing", "Search indexing directive", /\bnoindex\b/.test(robots) ? "issue" : "good",
      /\bnoindex\b/.test(robots) ? "The page has a noindex directive." : "No noindex directive was found in the page metadata.",
      /\bnoindex\b/.test(robots) ? "Remove noindex if this page should appear in search and AI answers." : "Check the HTTP X-Robots-Tag response header separately if indexing looks incorrect.", robots || undefined),
    check("accessibility", "Page basics", language && viewport ? "good" : "warning",
      `Language ${language ? `“${language}”` : "missing"}; mobile viewport ${viewport ? "present" : "missing"}.`,
      "Set the document language and responsive viewport so crawlers and mobile visitors can interpret the page."),
    check("image-alt", "Image descriptions", imagesWithoutAlt === 0 ? "good" : "warning",
      imageTags.length ? `${imagesWithoutAlt} of ${imageTags.length} images have no alt text.` : "No image elements were found.",
      "Add concise alt text to informative images and empty alt attributes to decorative images."),
    check("robots-file", "Crawler rules", robotsFile.text ? "good" : "warning",
      robotsFile.text ? "robots.txt is reachable." : "robots.txt was not readable at the standard location.",
      "Publish a valid robots.txt that allows intended public pages and points crawlers to the sitemap.", robotsFile.text.slice(0, 220) || undefined),
    check("sitemap", "XML sitemap", sitemapFile.text ? "good" : "warning",
      sitemapFile.text ? `Sitemap is reachable at ${sitemapFile.url}.` : "No readable sitemap.xml was found at the default or robots.txt-declared location.",
      "Publish an XML sitemap with canonical, indexable URLs and reference it from robots.txt.", sitemapFile.text ? sitemapFile.url : undefined),
    check("llms", "AI crawler guide", llmsFile.text ? "good" : "info",
      llmsFile.text ? "llms.txt is reachable." : "No llms.txt file was found at the site root.",
      "Optionally publish llms.txt with links to authoritative, useful public pages; it complements rather than replaces crawlable pages.", llmsFile.text.slice(0, 220) || undefined),
  ];
  const scored = checks.filter((item) => item.status !== "info");
  const score = Math.round(scored.reduce((total, item) => total + (item.status === "good" ? 1 : item.status === "warning" ? 0.55 : 0), 0) / Math.max(1, scored.length) * 100);

  return {
    url: page.url,
    checkedAt: new Date().toISOString(),
    score,
    checks,
    page: { title, description, wordCount: words, headings: headings.length, schemaTypes: [...new Set(schemaTypes)] },
  };
}
