import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadBrand } from "@/lib/geo/store";
import { checkRateLimit } from "@/lib/rate-limit";
import { STEP_RUNNERS, StepBlocked } from "@/lib/prospecting/steps";
import { loadState, saveState } from "@/lib/prospecting/store";
import { STEP_ORDER, type StepEvent, type StepId } from "@/lib/prospecting/types";
import { assertCanAfford, charge, grant, InsufficientCredits } from "@/lib/credits/ledger";
import { keepPaid, stepBill } from "@/lib/credits/prospecting";
import type { CreditAction } from "@/lib/credits/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// The credit each billable step needs at least one of before it starts.
const STEP_ACTION: Partial<Record<StepId, CreditAction>> = { research: "research", companies: "company", contacts: "contact", emails: "email" };

// Runs one pipeline step and streams its progress as newline-delimited JSON:
// {"type":"log"} lines while it works, then {"type":"done"} with the saved
// state, or {"type":"error"}. Log lines describe real operations as they
// happen; nothing is replayed or simulated.
export async function POST(request: Request) {
  try {
    const access = await resolveWorkspaceAccess(request, "runScans");
    const body = (await readJsonBody(request, 4 * 1024)) as { step?: unknown };
    const step = body.step as StepId;
    if (!STEP_ORDER.includes(step)) throw new RequestError("Unknown step.", 400);

    const user = access.identity;
    if (user.idToken !== "demo-token") {
      const limit = await checkRateLimit(`prospecting:${user.uid}`, 30, 3600, user);
      if (limit && !limit.allowed) {
        return Response.json({ error: "Too many runs this hour. Try again shortly." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } });
      }
    }

    const action = STEP_ACTION[step];
    if (action) {
      try {
        await assertCanAfford(access.workspaceUid, action);
      } catch (error) {
        if (error instanceof InsufficientCredits) return Response.json({ error: error.message, code: "INSUFFICIENT_CREDITS" }, { status: 402 });
        throw error;
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: StepEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        const lines: string[] = [];
        try {
          await inWorkspace(access, async () => {
            const brand = await loadBrand();
            if (!brand) throw new StepBlocked("Set up your brand profile first.");
            const before = await loadState();
            const log = (text: string) => {
              const at = new Date().toISOString();
              lines.push(text);
              send({ type: "log", step, text, at });
            };
            let after = await STEP_RUNNERS[step](before, { brand, senderName: user.name || user.email || "", log });
            // Bill the results the step added; keep only what the balance paid for.
            const bill = stepBill(step, before, after);
            let credits: { charged: number; balance: number } | undefined;
            if (bill && bill.units > 0) {
              const paid = await charge(access.workspaceUid, bill.action, bill.units, `Prospecting: ${step}`);
              credits = { charged: paid.credits, balance: paid.balance };
              if (paid.units < bill.units) {
                after = keepPaid(step, before, after, paid.units);
                log(`kept ${paid.units} of ${bill.units} results the balance covers; buy credits to get the rest`);
              }
              log(`charged ${paid.credits} credit${paid.credits === 1 ? "" : "s"}, ${paid.balance} left`);
            }
            const saved = { ...after, logs: { ...(after.logs ?? {}), [step]: lines.slice(-60) } };
            try {
              await saveState(saved);
            } catch (error) {
              if (credits?.charged) await grant(access.workspaceUid, credits.charged, `Refund: ${step} could not be saved`, `refund_${step}_${Date.now()}`, "refund");
              throw error;
            }
            send({ type: "done", step, state: saved, credits });
          });
        } catch (error) {
          const message = error instanceof StepBlocked || error instanceof RequestError
            ? error.message
            : "This step could not finish. Try again, or contact hello@gothreadly.live if it continues.";
          if (!(error instanceof StepBlocked) && !(error instanceof RequestError)) console.error("prospecting step failed", step, error);
          send({ type: "error", step, message });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
  } catch (error) {
    return errorResponse(error, "POST /api/prospecting/run");
  }
}
