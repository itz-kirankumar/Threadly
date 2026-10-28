// Sender OAuth consent flow. This is the ONLY path that can activate a
// sender. It is implemented end to end but stays inactive in every current
// deployment: it needs provider OAuth client envs (absent), the consenting
// mailbox owner to complete the provider consent page, and
// OUTBOUND_PROVIDERS_LIVE for any live send. Executing a real consent is an
// owner-authorized action; this code existing is not authorization.

import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "./token-crypto.ts";
import { createOAuthState, verifyOAuthState } from "./oauth-state.ts";
import { mailAdapter, oauthConfigFor, requiredEnvsFor } from "./providers/registry.ts";
import type { FetchImpl } from "./providers/types.ts";
import { auditEvent, type AuditStore } from "./audit.ts";
import type { ConsentTrace, Sender, SenderProvider } from "./types.ts";

export interface ConsentSenderStore {
  getSender(tenantId: string, senderId: string): Promise<Sender | null>;
  listSenders(tenantId: string): Promise<Sender[]>;
  saveSender(sender: Sender): Promise<void>;
  activateSenderFromConsent(tenantId: string, senderId: string, consentTraceId: string, scopes: string[]): Promise<Sender>;
  revokeSender(tenantId: string, senderId: string): Promise<Sender>;
}

export interface ConsentRecords {
  // Single-use OAuth state consumption: returns true exactly once per
  // state. Atomic against concurrent callbacks (RTDB transaction / store CAS).
  consumeOAuthState(tenantId: string, stateId: string, expiresAt: string): Promise<boolean>;
  saveConsentTrace(trace: ConsentTrace): Promise<void>;
  getConsentTrace(tenantId: string, consentTraceId: string): Promise<ConsentTrace | null>;
  saveSenderTokens(tenantId: string, senderId: string, ciphertext: string): Promise<void>;
  getSenderTokens(tenantId: string, senderId: string): Promise<{ ciphertext: string } | null>;
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

// Consent-first start ("Connect Google" self-service): no registered sender
// yet. The signed state carries an empty senderId and the provider; the
// callback auto-registers the sender from the consented account's verified
// identity. Same config/env requirements as the registered-sender flow.
export async function beginConsentFirst(input: {
  tenantId: string;
  provider: SenderProvider;
  purpose?: "send" | "calendar";
}): Promise<{ ok: true; consentUrl: string; expiresAt: string } | { ok: false; status: number; error: string; requiredEnvs?: string[] }> {
  const config = oauthConfigFor(input.provider);
  if (!config) {
    return {
      ok: false,
      status: 503,
      error: `OAuth client for ${input.provider} is not configured on this deployment. The consent flow is implemented but inactive until these are set.`,
      requiredEnvs: [...requiredEnvsFor(input.provider), "OUTBOUND_OAUTH_STATE_KEY", "OUTBOUND_TOKEN_KEY"],
    };
  }
  const purpose = input.purpose ?? "send";
  const adapter = mailAdapter(input.provider);
  const { state, expiresAt } = createOAuthState({ tenantId: input.tenantId, senderId: "", purpose, provider: input.provider });
  const requestedScopes = purpose === "calendar" ? adapter.calendarScopes : adapter.consentScopes;
  const consentUrl = adapter.buildConsentUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    loginHint: "",
    scopes: requestedScopes,
  });
  return { ok: true, consentUrl, expiresAt };
}

export async function completeConsent(
  senders: ConsentSenderStore,
  records: ConsentRecords,
  input: { expectedTenantId: string; state: string; code: string; fetchImpl?: FetchImpl; audit?: AuditStore }
): Promise<CompleteConsentResult> {
  let stateData: { tenantId: string; senderId: string; purpose: "send" | "calendar"; provider: "gmail" | "microsoft" | null };
  try {
    stateData = verifyOAuthState(input.state);
  } catch (error) {
    return { ok: false, status: 400, error: `Invalid consent state: ${String(error)}` };
  }
  if (stateData.tenantId !== input.expectedTenantId) {
    return { ok: false, status: 403, error: "Consent state does not belong to this workspace." };
  }
  // Single-use: consume the state BEFORE the token exchange. Replays,
  // revoke-then-replay and concurrent callbacks all resolve to one winner;
  // sender-status checks alone would let a replay reactivate after revoke.
  const stateId = createHash("sha256").update(input.state, "utf8").digest("hex");
  const consumed = await records.consumeOAuthState(stateData.tenantId, stateId, new Date(Date.now() + 60_000).toISOString());
  if (!consumed) {
    return { ok: false, status: 409, error: "This consent link was already used. Start a new connection from the app." };
  }
  // Consent-first ("Connect Google") states carry an empty senderId and a
  // provider; the sender is resolved from the consented account identity
  // after the token exchange, not before it.
  const consentFirst = stateData.senderId === "";
  let sender = consentFirst ? null : await senders.getSender(stateData.tenantId, stateData.senderId);
  let createdSender: Sender | null = null;
  if (!consentFirst && !sender) return { ok: false, status: 404, error: "Sender not found." };
  if (sender && sender.status !== "pending_consent" && sender.status !== "revoked") {
    return { ok: false, status: 409, error: `Sender is ${sender.status}; nothing to consent.` };
  }
  if (consentFirst && !stateData.provider) {
    return { ok: false, status: 400, error: "Consent-first state is missing its provider." };
  }
  const provider = sender ? sender.provider : stateData.provider!;
  const config = oauthConfigFor(provider);
  if (!config) {
    return { ok: false, status: 503, error: `OAuth client for ${provider} is not configured on this deployment.`, };
  }
  const adapter = mailAdapter(provider, input.fetchImpl);
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
  // Verify the consented mailbox identity before any activation.
  let profile: { email: string };
  try {
    profile = await adapter.fetchProfile({ accessToken: tokens.accessToken });
  } catch (error) {
    return { ok: false, status: 502, error: `Could not verify consented mailbox identity: ${String(error)}` };
  }
  const consentedEmail = profile.email.trim().toLowerCase();
  let autoRegistered = false;
  if (consentFirst) {
    // Find-or-create the sender by verified consented identity, never by
    // anything the caller typed. Binding rules: an existing sender with the
    // same provider and mailbox reconnects; an existing sender that is
    // already active refuses (a replayed state cannot double-activate); a
    // provider mismatch refuses.
    const existing = (await senders.listSenders(stateData.tenantId)).find((s) => s.email === consentedEmail);
    if (existing) {
      if (existing.provider !== provider) {
        return { ok: false, status: 409, error: `Mailbox ${consentedEmail} is already registered for ${existing.provider}; cannot connect it as ${provider}.` };
      }
      // Calendar purpose EXTENDS an already-active sender (a second consent
      // grant widens its scopes); send purpose on an active sender stays a
      // no-op refusal.
      const calendarExtend = stateData.purpose === "calendar" && existing.status === "active";
      if (!calendarExtend && existing.status !== "pending_consent" && existing.status !== "revoked") {
        return { ok: false, status: 409, error: `Mailbox ${consentedEmail} is already connected (${existing.status}); nothing to consent.` };
      }
      sender = existing;
    } else {
      const nowIso = new Date().toISOString();
      sender = {
        tenantId: stateData.tenantId,
        senderId: `snd_${crypto.randomUUID()}`,
        provider,
        email: consentedEmail,
        status: "pending_consent",
        consentTraceId: null,
        scopes: [],
        dailyCap: 0, // dispatch stays blocked until an explicit cap is set
        localTimezone: "UTC",
        createdAt: nowIso,
        createdBy: "oauth-callback",
      };
      await senders.saveSender(sender);
      autoRegistered = true;
      createdSender = sender;
      await input.audit?.append(auditEvent({
        tenantId: stateData.tenantId, actor: "oauth-callback", action: "sender.auto_registered",
        target: `sender:${sender.senderId}`, outcome: "success", detail: `consent-first connect for ${consentedEmail}`,
      }));
    }
  }
  sender = sender ?? createdSender;
  if (!sender) return { ok: false, status: 404, error: "Sender not found." };
  if (sender.email !== consentedEmail) {
    return {
      ok: false,
      status: 409,
      error: `Consented mailbox (${profile.email}) does not match the registered sender (${sender.email}). Sender was NOT activated.`,
    };
  }
  const now = new Date().toISOString();
  const granted = tokens.scopes.length > 0 ? tokens.scopes : [...(stateData.purpose === "calendar" ? adapter.calendarScopes : adapter.consentScopes)];
  // A calendar re-consent widens an active sender: keep its existing grants
  // and add the newly granted scopes (union), never narrow.
  const effectiveScopes = stateData.purpose === "calendar" ? [...new Set([...sender.scopes, ...granted])] : granted;
  const trace: ConsentTrace = {
    tenantId: sender.tenantId,
    consentTraceId: `ctc_${crypto.randomUUID()}`,
    senderId: sender.senderId,
    provider: sender.provider,
    scopes: effectiveScopes,
    consentedAt: now,
    consentorIdentity: consentedEmail,
    revokedAt: null,
    createdAt: now,
    createdBy: "oauth-callback",
  };
  await records.saveSenderTokens(sender.tenantId, sender.senderId, encryptSecret(JSON.stringify(tokens)));
  await records.saveConsentTrace(trace);
  await senders.activateSenderFromConsent(sender.tenantId, sender.senderId, trace.consentTraceId, trace.scopes);
  await input.audit?.append(auditEvent({
    tenantId: sender.tenantId, actor: "oauth-callback", action: "sender.consent_completed",
    target: `sender:${sender.senderId}`, outcome: "success",
    detail: `scopes:${trace.scopes.join(" ")}${autoRegistered ? " auto_registered:true" : ""}`,
  }));
  return { ok: true, senderId: sender.senderId, consentTraceId: trace.consentTraceId, consentorIdentity: consentedEmail };
}

// Disconnect: revokes the sender, marks the trace revoked and deletes stored
// tokens. Dispatch denies non-active senders, so revocation stops future
// dispatch immediately at the sender gate.
export async function revokeConsent(
  senders: ConsentSenderStore,
  records: ConsentRecords,
  input: { tenantId: string; senderId: string; actor?: string; audit?: AuditStore; fetchImpl?: FetchImpl }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const sender = await senders.getSender(input.tenantId, input.senderId);
  if (!sender) return { ok: false, status: 404, error: "Sender not found." };
  if (sender.consentTraceId) {
    const trace = await records.getConsentTrace(input.tenantId, sender.consentTraceId);
    if (trace && !trace.revokedAt) {
      await records.saveConsentTrace({ ...trace, revokedAt: new Date().toISOString() });
    }
  }
  // Google-side token revocation, best-effort BEFORE local deletion. Local
  // behavior is fail-closed either way: tokens are deleted and the sender is
  // revoked, so dispatch stays stopped. A failed/absent provider revocation is
  // audited truthfully, never silently claimed.
  let providerRevoked = "skipped";
  const stored = await records.getSenderTokens(input.tenantId, input.senderId);
  if (stored) {
    try {
      const tokens = JSON.parse(decryptSecret(stored.ciphertext)) as { refreshToken?: string | null; accessToken?: string | null };
      const token = tokens.refreshToken ?? tokens.accessToken;
      if (token) {
        const adapter = mailAdapter(sender.provider, input.fetchImpl);
        providerRevoked = (await adapter.revokeTokens({ token })) ? "true" : "false";
      }
    } catch {
      providerRevoked = "false";
    }
  }
  await records.deleteSenderTokens(input.tenantId, input.senderId);
  await senders.revokeSender(input.tenantId, input.senderId);
  await input.audit?.append(auditEvent({
    tenantId: input.tenantId, actor: input.actor ?? "unknown", action: "sender.consent_revoked",
    target: `sender:${input.senderId}`, outcome: "success", detail: `provider_revoked:${providerRevoked}`,
  }));
  return { ok: true };
}
