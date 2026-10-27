// OpenAI-compatible HTTP provider. Real implementation, configured only via
// OUTBOUND_LLM_BASE_URL / OUTBOUND_LLM_API_KEY / OUTBOUND_LLM_MODEL (absent
// everywhere now). Selecting a supplier requires the owner/procurement
// decision on data use, retention, region and subprocessors (PRD section 04,
// D04); this module does not make that choice.

import type { FetchImpl } from "../providers/types.ts";
import type { PersonalizationProvider, PersonalizeRequest, PersonalizeResult } from "./types.ts";
import { validateModelOutput } from "./types.ts";

export class LLMNotConfiguredError extends Error {
  constructor() {
    super("OUTBOUND_LLM_BASE_URL/OUTBOUND_LLM_API_KEY/OUTBOUND_LLM_MODEL are not configured; model endpoint unavailable");
  }
}

export class HttpLLMProvider implements PersonalizationProvider {
  readonly name = "http-llm";
  readonly synthetic = false;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: FetchImpl;

  constructor(fetchImpl?: FetchImpl) {
    const baseUrl = process.env.OUTBOUND_LLM_BASE_URL;
    const apiKey = process.env.OUTBOUND_LLM_API_KEY;
    const model = process.env.OUTBOUND_LLM_MODEL;
    if (!baseUrl || !apiKey || !model) throw new LLMNotConfiguredError();
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.model = model;
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init));
  }

  async personalize(request: PersonalizeRequest): Promise<PersonalizeResult> {
    const prompt = [
      "Personalize this B2B email strictly from the provided evidence.",
      "Rules: never invent prior contact, familiarity, testimonials or results; use only listed variables.",
      `Allowed variables: ${request.allowedVariables.join(", ")}`,
      `Evidence: ${JSON.stringify(request.evidence)}`,
      `Subject template: ${request.template.subject}`,
      `Body template: ${request.template.body}`,
      'Return JSON: {"subject": string, "body": string}. Keep {{variable}} placeholders for variables you use.',
    ].join("\n");
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch (error) {
      return { ok: false, reasons: [`llm_request_failed:${String(error)}`] };
    }
    if (!res.ok) return { ok: false, reasons: [`llm_http_${res.status}`] };
    let parsed: { subject?: unknown; body?: unknown };
    try {
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      parsed = JSON.parse(data.choices?.[0]?.message?.content ?? "") as { subject?: unknown; body?: unknown };
    } catch {
      return { ok: false, reasons: ["llm_unparseable_output"] };
    }
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      return { ok: false, reasons: ["llm_unparseable_output"] };
    }
    const errors = validateModelOutput({ subject: parsed.subject, body: parsed.body }, request);
    if (errors.length) return { ok: false, reasons: errors };
    const used = [...new Set([...`${parsed.subject} ${parsed.body}`.matchAll(/\{\{([a-z0-9_]+)\}\}/gi)].map((m) => m[1]))];
    return { ok: true, subject: parsed.subject, body: parsed.body, usedVariables: used };
  }
}
