import { errorResponse } from "@/lib/api-request";
import { resolveWorkspaceAccess } from "@/lib/geo/team";
import { getAccount, getHistory } from "@/lib/credits/ledger";
import { CREDIT_LABELS, CREDIT_PACKS, CREDIT_RATES } from "@/lib/credits/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/credits - the workspace balance, recent history, rates and packs.
export async function GET(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "view");
    const [account, history] = await Promise.all([getAccount(access.workspaceUid), getHistory(access.workspaceUid, 30)]);
    return Response.json(
      {
        balance: account.balance,
        granted: account.granted,
        spent: account.spent,
        history,
        rates: Object.entries(CREDIT_RATES).map(([id, credits]) => ({ id, label: CREDIT_LABELS[id as keyof typeof CREDIT_RATES], credits })),
        packs: Object.entries(CREDIT_PACKS).map(([id, p]) => ({ id, name: p.name, credits: p.credits, amount: p.amount, currency: p.currency })),
        isOwner: access.role === "owner",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "GET /api/credits");
  }
}
