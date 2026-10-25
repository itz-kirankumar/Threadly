import { randomUUID } from "node:crypto";
import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { appendAudit, deleteQuery, loadQueries, saveQuery } from "@/lib/geo/store";
import { loadPlan, PLAN_LIMITS, planBlockResponse } from "@/lib/geo/plan";
import { classifyIntent } from "@/lib/geo/engine";
import type { TrackedQuery } from "@/lib/geo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERIES = 24;

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "editQuestions");
    const body = (await readJsonBody(request, 8 * 1024)) as { text?: unknown };
    if (typeof body.text !== "string" || body.text.trim().length < 8) {
      throw new RequestError("Enter the full buyer question to track.", 400);
    }
    const text = body.text.trim().slice(0, 200);
    return await inWorkspace(access, async () => {
      const [queries, plan] = await Promise.all([loadQueries(), loadPlan(access.identity.email)]);
      const planCap = PLAN_LIMITS[plan].queries ?? MAX_QUERIES;
      const cap = Math.min(MAX_QUERIES, planCap);
      if (queries.length >= cap) {
        if (planCap < MAX_QUERIES) {
          return planBlockResponse(`Your ${plan} plan tracks up to ${planCap} questions. Upgrade for more.`, plan);
        }
        throw new RequestError(`Track up to ${MAX_QUERIES} questions.`, 400);
      }
      if (queries.some((q) => q.text.toLowerCase() === text.toLowerCase())) {
        throw new RequestError("You are already tracking that question.", 400);
      }
      const query: TrackedQuery = {
        id: `q-${randomUUID()}`,
        text,
        intent: classifyIntent(text),
        createdAt: new Date().toISOString(),
      };
      await saveQuery(query);
      await appendAudit({ actor: access.identity.email, action: "question.added", detail: text });
      return Response.json({ query });
    });
  } catch (error) {
    return errorResponse(error, "Add query");
  }
}

export async function DELETE(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "deleteQuestions");
    const body = (await readJsonBody(request, 4 * 1024)) as { queryId?: unknown };
    if (typeof body.queryId !== "string" || !body.queryId) throw new RequestError("Missing query id.", 400);
    return await inWorkspace(access, async () => {
      const existing = await loadQueries();
      const target = existing.find((q) => q.id === body.queryId);
      await deleteQuery(body.queryId as string);
      await appendAudit({ actor: access.identity.email, action: "question.removed", detail: target?.text ?? (body.queryId as string) });
      return Response.json({ ok: true });
    });
  } catch (error) {
    return errorResponse(error, "Delete query");
  }
}
