// Local deterministic stand-in for a model endpoint: performs no external
// call, no cost, synthetic usage. It exists so the LLM-assisted path can be
// exercised end to end without provider selection or spend.

import type { PersonalizationProvider, PersonalizeRequest, PersonalizeResult } from "./types.ts";
import { validateModelOutput } from "./types.ts";

export class MockLLMProvider implements PersonalizationProvider {
  readonly name = "mock-llm";
  readonly synthetic = true;

  async personalize(request: PersonalizeRequest): Promise<PersonalizeResult> {
    const fill = (text: string) =>
      text.replace(/\{\{([a-z0-9_]+)\}\}/gi, (m, v) => (v in request.evidence ? request.evidence[v] : m));
    const result = { subject: fill(request.template.subject), body: fill(request.template.body) };
    const errors = validateModelOutput(result, request);
    if (errors.length) return { ok: false, reasons: errors };
    return {
      ok: true,
      subject: result.subject,
      body: result.body,
      usedVariables: Object.keys(request.evidence).filter((v) => request.allowedVariables.includes(v)),
    };
  }
}
