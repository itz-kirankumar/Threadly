// Sender OAuth consent flow. This is the ONLY path that can activate a
// sender. It is implemented end to end but stays inactive in every current
// deployment: it needs provider OAuth client envs (absent), the consenting
// mailbox owner to complete the provider consent page, and
// OUTBOUND_PROVIDERS_LIVE for any live send. Executing a real consent is an
// owner-authorized action; this code existing is not authorization.

import { encryptSecret } from "./token-crypto.ts";
import { createOAuthState, verifyOAuthState } from "./oauth-state.ts";
import { mailAdapter, oauthConfigFor, requiredEnvsFor } from "./providers/registry.ts";
import type { FetchImpl } from "./providers/types.ts";
import type { ConsentTrace, Sender } from "./types.ts";

export interface ConsentSenderStore {
  getSender(tenantId: string, senderId: string): Promise<Sender | null>;
  activateSenderFromConsent(tenantId: string, senderId: string, consentTraceId: string, scopes: string[]): Promise<Sender>;
  revokeSender(tenantId: string, senderId: string): Promise<Sender>;
}

export interface ConsentRecords {
  saveConsentTrace(trace: ConsentTrace): Promise<void>;
  getConsentTrace(tenantId: string, consentTraceId: string): Promise<ConsentTrace | null>;
  saveSenderTokens(tenantId: string, senderId: string, ciphertext: string): Promise<void>;
  deleteSenderTokens(tenantId: string, senderId: string): Promise<void>;
}

export type BeginConsentResult =
  | { ok: true; consentUrl: string; expiresAt: string; provider: Sender["provider"] }
  | { ok: false; status: number; error: string; requiredEnvs?: string[] };

export async function beginConsent(
  senders: ConsentSenderStore,
  input: { tenantId: string; senderId: string; purpose?: "send" | "calendar" }
): Promise<BeginConsentResult> {
  const sender = await senders.getSender(input.tenantId, input.senderId);
  if (!sender) return { ok: false, status: 404, error: "Sender not found." };
  if (sender.status !== "pending_consent" && sender.status !== "revoked") {
    return { ok: false, status: 409, error: `Sender is ${sender.status}; consent can only begin from pending_consent or revoked.` };
  }
  const config = oauthConfigFor(sender.provider);
  if (!config) {
    return {
      ok: false,
      status: 503,
      error: `OAuth client for ${sender.provider} is not configured on this deployment. The consent flow is implemented but inactive until these are set.`,
      requiredEnvs: [...requiredEnvsFor(sender.provider), "OUTBOUND_OAUTH_STATE_KEY", "OUTBOUND_TOKEN_KEY"],
    };
  }
  const purpose = input.purpose ?? "send";
  const adapter = mailAdapter(sender.provider);
  const { state, expiresAt } = createOAuthState({ tenantId: sender.tenantId, senderId: sender.senderId, purpose });
  const requestedScopes = purpose === "calendar" ? adapter.calendarScopes : adapter.consentScopes;
  const consentUrl = adapter.buildConsentUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    loginHint: sender.email,
    scopes: requestedScopes,
  });
  return { ok: true, consentUrl, expiresAt, provider: sender.provider };
}

export type CompleteConsentResult =
  | { ok: true; senderId: string; consentTraceId: string; consentorIdentity: string }
  | { ok: false; status: number; error: string };

export async function completeConsent(
  senders: ConsentSenderStore,
  records: ConsentRecords,
  input: { expectedTenantId: string; state: string; code: string; fetchImpl?: FetchImpl }
): Promise<CompleteConsentResult> {
  let stateData: { tenantId: string; senderId: string; purpose: "send" | "calendar" };
  try {
    stateData = verifyOAuthState(input.state);
  } catch (error) {
    return { ok: false, status: 400, error: `Invalid consent state: ${String(error)}` };
  }
  if (stateData.tenantId !== input.expectedTenantId) {
    return { ok: false, status: 403, error: "Consent state does not belong to this workspace." };
  }
  const sender = await senders.getSender(stateData.tenantId, stateData.senderId);
  if (!sender) return { ok: false, status: 404, error: "Sender not found." };
  if (sender.status !== "pending_consent" && sender.status !== "revoked") {
    return { ok: false, status: 409, error: `Sender is ${sender.status}; nothing to consent.` };
  }
  const config = oauthConfigFor(sender.provider);
  if (!config) {
    return { ok: false, status: 503, error: `OAuth client for ${sender.provider} is not configured on this deployment.`, };
  }
  const adapter = mailAdapter(sender.provider, input.fetchImpl);
  let tokens;
  try {
    tokens = await adapter.exchangeCode({
      ...config,
      code: input.code,
      scopes: stateData.purpose === "calendar" ? adapter.calendarScopes : adapter.consentScopes,
    });
  } catch (error) {
    return { ok: false, status: 502, error: `Provider token exchange failed: ${String(error)}` };
  }
  // Verify the consented mailbox is the registered sender before activating.
  let profile: { email: string };
  try {
    profile = await adapter.fetchProfile({ accessToken: tokens.accessToken });
  } catch (error) {
    return { ok: false, status: 502, error: `Could not verify consented mailbox identity: ${String(error)}` };
  }
  if (profile.email.trim().toLowerCase() !== sender.email) {
    return {
      ok: false,
      status: 409,
      error: `Consented mailbox (${profile.email}) does not match the registered sender (${sender.email}). Sender was NOT activated.`,
    };
  }
  const now = new Date().toISOString();
  const trace: ConsentTrace = {
    tenantId: sender.tenantId,
    consentTraceId: `ctc_${crypto.randomUUID()}`,
    senderId: sender.senderId,
    provider: sender.provider,
    scopes: tokens.scopes.length > 0 ? tokens.scopes : [...(stateData.purpose === "calendar" ? adapter.calendarScopes : adapter.consentScopes)],
    consentedAt: now,
    consentorIdentity: profile.email,
    revokedAt: null,
    createdAt: now,
    createdBy: "oauth-callback",
  };
  await records.saveSenderTokens(sender.tenantId, sender.senderId, encryptSecret(JSON.stringify(tokens)));
  await records.saveConsentTrace(trace);
  await senders.activateSenderFromConsent(sender.tenantId, sender.senderId, trace.consentTraceId, trace.scopes);
  return { ok: true, senderId: sender.senderId, consentTraceId: trace.consentTraceId, consentorIdentity: profile.email };
}

// Disconnect: revokes the sender, marks the trace revoked and deletes stored
// tokens. Dispatch denies non-active senders, so revocation stops future
// dispatch immediately at the sender gate.
export async function revokeConsent(
  senders: ConsentSenderStore,
  records: ConsentRecords,
  input: { tenantId: string; senderId: string }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const sender = await senders.getSender(input.tenantId, input.senderId);
  if (!sender) return { ok: false, status: 404, error: "Sender not found." };
  if (sender.consentTraceId) {
    const trace = await records.getConsentTrace(input.tenantId, sender.consentTraceId);
    if (trace && !trace.revokedAt) {
      await records.saveConsentTrace({ ...trace, revokedAt: new Date().toISOString() });
    }
  }
  await records.deleteSenderTokens(input.tenantId, input.senderId);
  await senders.revokeSender(input.tenantId, input.senderId);
  return { ok: true };
}
