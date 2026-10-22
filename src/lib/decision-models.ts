import { RequestError } from "./api-request";

export type ProspectQualification = {
  fit: "strong_fit" | "possible_fit" | "weak_fit";
  fitConfidence: number;
  buyingIntent: number;
  model: "Laya" | "AnyJev";
  route: "language" | "confidence" | "fallback";
  assessedAt: string;
};

type Decision = { answer: string; confidence: number; probabilities: Record<string, number> };
const anyjevBase = () => process.env.ANYJEV_URL?.trim().replace(/\/$/, "") || "";
const layaBase = () => process.env.LAYA_URL?.trim().replace(/\/$/, "") || "";

export function getDecisionModelStatus() {
  return {
    laya: Boolean(layaBase() && process.env.LAYA_API_KEY?.trim()),
    anyjev: Boolean(anyjevBase()),
  };
}

function headers(kind: "laya" | "anyjev") {
  const token = kind === "laya" ? process.env.LAYA_API_KEY : process.env.ANYJEV_API_KEY;
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function boundedProbability(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

function parseProbabilities(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, probability]) => [key, boundedProbability(probability)]));
}

async function requestJson(url: string, tokenHeaders: Record<string, string>, body: unknown, label: string) {
  const response = await fetch(url, { method: "POST", headers: tokenHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${label} decision service returned HTTP ${response.status}.`);
  return response.json();
}

async function runLaya(state: string): Promise<{ fit: Decision; intent: Decision }> {
  const base = layaBase();
  if (!base) throw new Error("Laya is not configured.");
  const result = await requestJson(`${base}/v1/systemone`, headers("laya"), {
    state,
    questions: {
      fit: {
        type: "choice",
        instructions: "How closely does this public prospect conversation match the product's ideal customer and stated pain points?",
        criteria: {
          strong_fit: "The prospect clearly describes the target customer's problem and the product directly addresses it.",
          possible_fit: "There is a plausible problem match, but the conversation lacks enough detail to confirm fit.",
          weak_fit: "The prospect's stated need does not match the product's target customer or problem.",
        },
      },
      buying_intent: { type: "noul", instructions: "Does the prospect express active intent to solve this problem or evaluate a solution?" },
    },
    min_confidence: 0,
  }, "Laya") as { answers?: Record<string, { choice?: string; noul?: number; answer_confidence?: number; confidence?: number; probabilities?: Record<string, number> }> };
  const fit = result.answers?.fit;
  const intent = result.answers?.buying_intent;
  if (!fit?.choice || !intent) throw new Error("Laya returned an incomplete qualification.");
  return {
    fit: { answer: fit.choice, confidence: boundedProbability(fit.answer_confidence ?? fit.confidence ?? fit.probabilities?.[fit.choice]), probabilities: parseProbabilities(fit.probabilities) },
    intent: { answer: String(boundedProbability(intent.noul)), confidence: boundedProbability(intent.answer_confidence ?? intent.confidence), probabilities: { yes: boundedProbability(intent.noul), no: 1 - boundedProbability(intent.noul) } },
  };
}

async function runAnyJev(state: string): Promise<{ fit: Decision; intent: Decision }> {
  const base = anyjevBase();
  if (!base) throw new Error("AnyJev is not configured.");
  const endpoint = base.endsWith("/v1/decide") ? base : `${base}/v1/decide`;
  const result = await requestJson(endpoint, headers("anyjev"), { items: [
    { state, question: "How closely does this prospect conversation match the target customer's problem the product solves?", options: ["strong_fit", "possible_fit", "weak_fit"], kind: "choice" },
    { state, question: "Does the prospect express active intent to solve this problem or evaluate a solution?", kind: "yes_no" },
  ] }, "AnyJev") as { decisions?: Array<{ answer?: string; probs?: Record<string, number>; route?: string }>; answer?: string; probs?: Record<string, number>; route?: string };
  const decisions = result.decisions || (Array.isArray(result) ? result as unknown as Array<{ answer?: string; probs?: Record<string, number>; route?: string }> : []);
  if (decisions.length < 2) throw new Error("AnyJev returned an incomplete qualification.");
  const toDecision = (raw: { answer?: string; probs?: Record<string, number> }, yesNo = false): Decision => {
    const probabilities = parseProbabilities(raw.probs);
    const answer = String(raw.answer || "");
    const answerKey = yesNo ? (/^(yes|true|1)$/i.test(answer) ? "yes" : "no") : answer;
    const confidence = probabilities[answer] ?? probabilities[answerKey] ?? Math.max(0, ...Object.values(probabilities));
    return { answer: answerKey, confidence, probabilities: yesNo ? { yes: probabilities.yes ?? (answerKey === "yes" ? confidence : 1 - confidence), no: probabilities.no ?? (answerKey === "no" ? confidence : 1 - confidence) } : probabilities };
  };
  return { fit: toDecision(decisions[0]), intent: toDecision(decisions[1], true) };
}

function qualification(fit: Decision, intent: Decision, model: ProspectQualification["model"], route: ProspectQualification["route"]): ProspectQualification {
  const fitValue = ["strong_fit", "possible_fit", "weak_fit"].includes(fit.answer) ? fit.answer : "possible_fit";
  return {
    fit: fitValue as ProspectQualification["fit"],
    fitConfidence: fit.confidence,
    buyingIntent: intent.probabilities.yes ?? boundedProbability(intent.answer),
    model,
    route,
    assessedAt: new Date().toISOString(),
  };
}

export async function qualifyProspect(input: { post: string; companyContext: string }): Promise<ProspectQualification> {
  const state = `PRODUCT CONTEXT (founder supplied):\n${input.companyContext.slice(0, 8000)}\n\nPUBLIC PROSPECT CONVERSATION:\n${input.post.slice(0, 5000)}`;
  const { laya, anyjev } = getDecisionModelStatus();
  if (!laya && !anyjev) throw new RequestError("Prospect qualification is not configured. Ask your workspace administrator to connect Laya.", 503);

  // Laya is the primary decision model and routes each request to its
  // language-appropriate checkpoint. AnyJev is an optional secondary fallback.
  // This range intentionally detects non-ASCII text for language routing.
  // eslint-disable-next-line no-control-regex
  const multilingual = /[^\u0000-\u007f]/.test(input.post);
  const primary: ProspectQualification["model"] = laya ? "Laya" : "AnyJev";
  const fallbackAvailable = primary === "Laya" && anyjev;
  let first: { fit: Decision; intent: Decision } | null = null;
  try { first = primary === "Laya" ? await runLaya(state) : await runAnyJev(state); }
  catch (error) { if (!fallbackAvailable) throw error; }
  if (first && first.fit.confidence >= 0.68) return qualification(first.fit, first.intent, primary, multilingual ? "language" : "confidence");
  if (fallbackAvailable) {
    const second = await runAnyJev(state);
    // Prefer the fallback's decision when the primary was uncertain; attach confidence from its own distribution.
    return qualification(second.fit, second.intent, "AnyJev", first ? "confidence" : "fallback");
  }
  if (first) return qualification(first.fit, first.intent, primary, multilingual ? "language" : "confidence");
  throw new Error("No configured decision model could assess this prospect.");
}
