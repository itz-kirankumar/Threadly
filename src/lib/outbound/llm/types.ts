// Scoped server adapter for model-assisted personalization (PRD section 04).
// Deterministic templates remain the supported default; a model endpoint may
// assist behind this interface only. Contract rules enforced for EVERY
// provider, mock or real:
// - Only evidence-backed, allowlisted variables may appear in output.
// - Unsupported material falls back to the approved template, explicitly.
// - Tenant content must not train shared models: provider selection and its
//   data-use contract are owner/procurement decisions (D04), separate from
//   this code. No model supplier is selected by this module.

export interface PersonalizeRequest {
  intentId: string;
  step: number;
  template: { subject: string; body: string };
  evidence: Record<string, string>; // allowlisted variable -> value
  allowedVariables: string[];
}

export type PersonalizeResult =
  | { ok: true; subject: string; body: string; usedVariables: string[] }
  | { ok: false; reasons: string[] };

export interface PersonalizationProvider {
  readonly name: string;
  readonly synthetic: boolean; // mock/local: no external call, no cost
  personalize(request: PersonalizeRequest): Promise<PersonalizeResult>;
}

// Output may reference only allowlisted variables, and every allowlisted
// variable it uses must have evidence. Anything else is rejected so the
// caller can fall back to the approved template.
export function validateModelOutput(
  result: { subject: string; body: string },
  request: PersonalizeRequest
): string[] {
  const errors: string[] = [];
  const used = new Set<string>();
  for (const match of `${result.subject} ${result.body}`.matchAll(/\{\{([a-z0-9_]+)\}\}/gi)) {
    used.add(match[1]);
  }
  for (const variable of used) {
    if (!request.allowedVariables.includes(variable)) errors.push(`variable_not_allowlisted:${variable}`);
    else if (!(variable in request.evidence)) errors.push(`variable_without_evidence:${variable}`);
  }
  return errors;
}
