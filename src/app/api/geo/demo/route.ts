import { buildDemoWorkspace } from "@/lib/geo/demo";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(buildDemoWorkspace(), {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=3600" },
  });
}
