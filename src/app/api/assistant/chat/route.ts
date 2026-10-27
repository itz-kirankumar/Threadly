import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { pickAnswer, isConfidentialAsk, CONFIDENTIAL_ANSWER, ASSISTANT_SYSTEM_PROMPT } from "@/lib/assistant/knowledge";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Help-bot spend authority: $10/month aggregate (user-approved 2026-10-27).
// Enforcement is estimate-based against reserved budget; actual provider
// invoice is not readable here. Docs-first: Claude is called only when the
// curated public knowledge base has no matching answer.
const MONTHLY_CAP_USD = Number(process.env.ASSISTANT_MONTHLY_CAP_USD ?? "10");
const SAFETY_MARGIN = 0.8; // stop at 80% of the cap
const RESERVE_USD = 0.01; // pessimistic reservation per call (~40x observed estimate)
const MODEL = process.env.ASSISTANT_MODEL ?? "claude-haiku-5-5";

// Reserve budget atomically via an Admin SDK transaction. Returns false when
// over budget or the counter is unavailable (paid path fails closed).
async function reserveSpend(path: string, deltaMicros: number): Promise<boolean> {
  try {
    const { getAdminDatabase } = await import("@/lib/geo/admin-store");
    const db = await getAdminDatabase();
    if (!db) return false;
    const capMicros = MONTHLY_CAP_USD * SAFETY_MARGIN * 1_000_000;
    const result = await db.ref(path).transaction((current: number | null) => {
      const micros = typeof current === "number" ? current : 0;
      if (deltaMicros > 0 && micros + deltaMicros > capMicros) return; // abort: over budget
      return micros + deltaMicros;
    });
    return result.committed;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  let message = "";
  try {
    const body = (await request.json()) as { message?: unknown };
    if (typeof body.message === "string") message = body.message.slice(0, 800).trim();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!message) return NextResponse.json({ error: "empty_message" }, { status: 400 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`assistant:${ip}`, 20, 3600);
  if (rl && !rl.allowed) {
    return NextResponse.json({
      reply: "You're chatting faster than I can keep up. Give me a little break, or use the [contact page](/contact).",
    });
  }

  if (isConfidentialAsk(message)) {
    return NextResponse.json({ reply: CONFIDENTIAL_ANSWER });
  }

  const local = pickAnswer(message);
  if (local.entryId !== null) {
    return NextResponse.json({ reply: local.answer });
  }

  // KB miss: Claude path, only inside the reserved monthly budget.
  const monthKey = new Date().toISOString().slice(0, 7);
  const spendPath = `assistantUsage/monthly/${monthKey}`;
  const reserveMicros = Math.round(RESERVE_USD * 1_000_000);
  if (process.env.ANTHROPIC_API_KEY && (await reserveSpend(spendPath, reserveMicros))) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 300,
          system: ASSISTANT_SYSTEM_PROMPT,
          messages: [{ role: "user", content: message }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = (await res.json()) as {
          content?: Array<{ type: string; text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const text = (data.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
        if (text) {
          // Reconcile reservation with actual usage (Haiku 5.5: $0.10/MTok in, $0.50/MTok out, <=100k ctx).
          const inTok = data.usage?.input_tokens ?? 0;
          const outTok = data.usage?.output_tokens ?? 0;
          const actualMicros = Math.round(((inTok * 0.1 + outTok * 0.5) / 1_000_000) * 1_000_000);
          const refund = Math.max(0, reserveMicros - Math.max(actualMicros, reserveMicros * 0)); // conservative: keep reservation
          if (refund > 0) void reserveSpend(spendPath, -refund);
          return NextResponse.json({ reply: text });
        }
      }
    } catch {
      /* fall through to docs-only fallback */
    }
    void reserveSpend(spendPath, -reserveMicros); // release reservation on failure
  }

  return NextResponse.json({ reply: local.answer });
}
