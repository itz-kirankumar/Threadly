import { getState } from "@/lib/portal-data";
import { withWorkspace } from "@/lib/portal-db";
import { requireApprovedIdentity } from "@/lib/admin-auth";
import { errorResponse } from "@/lib/api-request";
import { buildLiveFeed } from "@/lib/threadly-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events feed for the workspace.
 *
 * The browser opens one authenticated GET and receives a `snapshot` event every few
 * seconds plus an immediate `hello` so the UI can show connection state.
 * The connection is closed by the client or after a
 * bounded number of ticks to stay friendly to serverless runtimes.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireApprovedIdentity(request);
  } catch (error) {
    return errorResponse(error, "Workspace live feed");
  }
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const uid = user.uid;
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const tick = async () => {
        try {
          const state = await getState(uid).catch(() => null);
          const events = buildLiveFeed(uid, 14, state?.opportunities, state?.leads);
          send("snapshot", {
            generatedAt: new Date().toISOString(),
            events,
            metrics: {
              active: events.filter((event) => event.kind === "outreach").length,
              signals: events.filter((event) => event.kind === "signal").length,
            },
          });
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : "Live feed unavailable.",
          });
        }
      };

      send("hello", { ok: true, uid, at: new Date().toISOString() });

      // Prime the feed so the client has data immediately.
      await withWorkspace(uid, user.idToken, async () => {
        await getState(uid).catch(() => undefined);
        await tick();
      });

      let ticks = 0;
      const timer = setInterval(async () => {
        ticks += 1;
        // Re-establish the workspace context for each tick: Firebase reads
        // need the identity that initiated the request.
        await withWorkspace(uid, user.idToken, async () => {
          await tick();
        });
        // Close after ~10 minutes; the client reconnects transparently.
        if (ticks > 120) cleanup();
      }, 5000);

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
