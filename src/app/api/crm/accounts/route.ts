import { errorResponse, readJsonBody } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import {
  loadCrmAccountsState, saveCompany, saveContact, saveDeal, updateDealStage, saveWorkspaceActivity, DEAL_STAGES,
} from "@/lib/crm/accounts-store";
import type { CompanyStatus, DealStage, WorkspaceActivityType } from "@/lib/crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(body: Record<string, unknown>, key: string, max: number, optional = false): string | undefined {
  const raw = body[key];
  if (raw === undefined || raw === null || raw === "") {
    if (optional) return undefined;
    throw new Error(`${key} is required.`);
  }
  if (typeof raw !== "string") throw new Error(`${key} must be text.`);
  const value = raw.trim();
  if (!value && !optional) throw new Error(`${key} is required.`);
  return value.slice(0, max) || undefined;
}

export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const state = await inWorkspace(access, () => loadCrmAccountsState());
    return Response.json(state);
  } catch (error) {
    return errorResponse(error, "GET /api/crm/accounts");
  }
}

export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 128 * 1024)) as Record<string, unknown>;
    const entity = text(body, "entity", 20);
    const owner = access.identity.email || access.identity.name || "User";

    const result = await inWorkspace(access, async () => {
      switch (entity) {
        case "company":
          return { company: await saveCompany({
            id: text(body, "id", 160, true),
            name: text(body, "name", 200)!,
            domain: text(body, "domain", 240, true),
            industry: text(body, "industry", 160, true),
            status: (text(body, "status", 30, true) || "prospect") as CompanyStatus,
            owner,
            source: text(body, "source", 120, true),
          }) };
        case "contact":
          return { contact: await saveContact({
            id: text(body, "id", 160, true),
            companyId: text(body, "companyId", 160, true),
            leadId: text(body, "leadId", 160, true),
            name: text(body, "name", 200)!,
            email: text(body, "email", 254, true),
            title: text(body, "title", 160, true),
            owner,
          }) };
        case "deal":
          return { deal: await saveDeal({
            id: text(body, "id", 160, true),
            companyId: text(body, "companyId", 160, true),
            contactId: text(body, "contactId", 160, true),
            name: text(body, "name", 200)!,
            value: typeof body.value === "number" ? body.value : Number(body.value || 0),
            currency: text(body, "currency", 6, true),
            stage: (text(body, "stage", 30, true) || "qualification") as DealStage,
            probability: typeof body.probability === "number" ? body.probability : Number(body.probability || 20),
            expectedClose: text(body, "expectedClose", 40, true),
            owner,
          }) };
        case "dealStage": {
          const stage = text(body, "stage", 30)! as DealStage;
          if (!DEAL_STAGES.includes(stage)) throw new Error("Unknown deal stage.");
          await updateDealStage(text(body, "id", 160)!, stage);
          return { ok: true };
        }
        case "activity":
          return { activity: await saveWorkspaceActivity({
            type: (text(body, "type", 20, true) || "note") as WorkspaceActivityType,
            subject: text(body, "subject", 240)!,
            body: text(body, "body", 4000, true),
            companyId: text(body, "companyId", 160, true),
            contactId: text(body, "contactId", 160, true),
            dealId: text(body, "dealId", 160, true),
            dueAt: text(body, "dueAt", 80, true),
            owner,
          }) };
        default:
          throw new Error("Unknown CRM entity.");
      }
    });

    return Response.json(result);
  } catch (error) {
    return errorResponse(error, "POST /api/crm/accounts");
  }
}
