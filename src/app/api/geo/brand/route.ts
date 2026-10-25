import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadBrand, saveBrand } from "@/lib/geo/store";
import type { BrandProfile, Competitor } from "@/lib/geo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanDomain(value: unknown): string {
  if (typeof value !== "string") throw new RequestError("Enter your website domain.", 400);
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new RequestError("Enter a valid domain, like example.com.", 400);
  return domain;
}

function cleanName(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length < 2) throw new RequestError(`Enter ${label}.`, 400);
  return value.trim().slice(0, 80);
}

function cleanAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 5);
}

export async function PUT(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "manageBrand");
    const body = (await readJsonBody(request, 512 * 1024)) as Record<string, unknown>;
    const competitors: Competitor[] = Array.isArray(body.competitors)
      ? (body.competitors as Array<Record<string, unknown>>)
          .slice(0, 8)
          .map((item) => ({
            name: cleanName(item.name, "a competitor name"),
            domain: cleanDomain(item.domain),
            aliases: cleanAliases(item.aliases),
          }))
      : [];
    const existing = await inWorkspace(access, () => loadBrand());
    let logoDataUrl = existing?.logoDataUrl;
    if (typeof body.logoDataUrl === "string") {
      if (!body.logoDataUrl) {
        logoDataUrl = undefined;
      } else if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(body.logoDataUrl) && body.logoDataUrl.length <= 400_000) {
        logoDataUrl = body.logoDataUrl;
      } else {
        throw new RequestError("Logo must be a PNG, JPEG or WebP image under 300 KB.", 400);
      }
    }
    const brand: BrandProfile = {
      name: cleanName(body.name, "your brand name"),
      domain: cleanDomain(body.domain),
      aliases: cleanAliases(body.aliases),
      category: typeof body.category === "string" ? body.category.trim().slice(0, 120) : "",
      competitors,
      ...(logoDataUrl ? { logoDataUrl } : {}),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await inWorkspace(access, () => saveBrand(brand));
    return Response.json({ brand });
  } catch (error) {
    return errorResponse(error, "Save brand");
  }
}
