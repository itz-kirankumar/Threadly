import { errorResponse, readJsonBody, RequestError } from "@/lib/api-request";
import { inWorkspace, resolveWorkspaceAccess } from "@/lib/geo/team";
import { loadBrand } from "@/lib/geo/store";
import { checkRateLimit } from "@/lib/rate-limit";
import { STEP_RUNNERS, StepBlocked } from "@/lib/prospecting/steps";
import { loadState, saveState } from "@/lib/prospecting/store";
import { STEP_ORDER, type StepEvent, type StepId } from "@/lib/prospecting/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
            const after = await STEP_RUNNERS[step](before, { brand, senderName: user.name || user.email || "", log });
            const saved = { ...after, logs: { ...(after.logs ?? {}), [step]: lines.slice(-60) } };
            await saveState(saved);
            send({ type: "done", step, state: saved });
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
