// Live dispatch provider: wraps a real mail adapter with encrypted-token
// loading and refresh. Reachable only when the sender is active (real OAuth
// consent completed) AND OUTBOUND_PROVIDERS_LIVE=true is set on the
// deployment. No current deployment sets that flag; every current run falls
// back to the mock adapter. Outcomes from this provider are real
// (synthetic: false); mock outcomes stay synthetic and excluded from real
// delivery counts.

import { decryptSecret, encryptSecret } from "../token-crypto.ts";
import type { RtdbConsentStore } from "../rtdb-consent-store.ts";
import type { MessageIntent, Sender } from "../types.ts";
import type { DispatchProvider } from "../dispatch.ts";
import { liveProvidersEnabled, mailAdapter, oauthConfigFor } from "./registry.ts";
import type { FetchImpl, ProviderTokens } from "./types.ts";

export class LiveDispatchProvider implements DispatchProvider {
  name = "live";

  private readonly consentStore: RtdbConsentStore;
  private readonly fetchImpl?: FetchImpl;

  constructor(consentStore: RtdbConsentStore, fetchImpl?: FetchImpl) {
    this.consentStore = consentStore;
    this.fetchImpl = fetchImpl;
  }

  private async accessToken(sender: Sender): Promise<string | null> {
    const stored = await this.consentStore.getSenderTokens(sender.tenantId, sender.senderId);
    if (!stored) return null;
    let tokens: ProviderTokens;
    try {
      tokens = JSON.parse(decryptSecret(stored.ciphertext)) as ProviderTokens;
    } catch {
      return null;
    }
    if (Date.parse(tokens.expiresAt) > Date.now() + 60_000) return tokens.accessToken;
    if (!tokens.refreshToken) return null;
    const config = oauthConfigFor(sender.provider);
    if (!config) return null;
    try {
      const refreshed = await mailAdapter(sender.provider, this.fetchImpl).refreshTokens({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        refreshToken: tokens.refreshToken,
      });
      if (!refreshed.refreshToken) refreshed.refreshToken = tokens.refreshToken;
      await this.consentStore.saveSenderTokens(sender.tenantId, sender.senderId, encryptSecret(JSON.stringify(refreshed)));
      return refreshed.accessToken;
    } catch {
      return null;
    }
  }

  async send(input: { sender: Sender; intent: MessageIntent; subject: string; body: string; to: string; listUnsubscribeUrl?: string }) {
    if (!input.to) {
      return { outcome: "unknown" as const, correlationId: null, statusCode: null, detail: "recipient email missing; no provider call made", synthetic: false };
    }
    const token = await this.accessToken(input.sender);
    if (!token) {
      // Ambiguous: we cannot prove a send did or did not happen this attempt,
      // but no provider call was made, so "unknown" quarantines the intent
      // for reconciliation rather than risking a blind retry later.
      return { outcome: "unknown" as const, correlationId: null, statusCode: null, detail: "oauth tokens unavailable or expired without refresh", synthetic: false };
    }
    const outcome = await mailAdapter(input.sender.provider, this.fetchImpl).send({
      accessToken: token,
      request: {
        intentId: input.intent.intentId,
        to: input.to,
        fromEmail: input.sender.email,
        subject: input.subject,
        bodyText: input.body,
        ...(input.listUnsubscribeUrl ? { listUnsubscribeUrl: input.listUnsubscribeUrl } : {}),
      },
    });
    return {
      outcome: outcome.outcome,
      correlationId: outcome.providerCorrelationId,
      statusCode: outcome.statusCode,
      detail: "detail" in outcome ? outcome.detail : null,
      synthetic: false,
    };
  }
}

// Chooses per send: live adapter only when the sender is active and the
// explicit live flag is set; otherwise the mock. Mock outcomes stay
// synthetic regardless of this routing.
export class RoutingDispatchProvider implements DispatchProvider {
  name = "routing";
  private readonly live: LiveDispatchProvider;

  constructor(consentStore: RtdbConsentStore, fetchImpl?: FetchImpl) {
    this.live = new LiveDispatchProvider(consentStore, fetchImpl);
  }

  async send(input: { sender: Sender; intent: MessageIntent; subject: string; body: string; to: string; listUnsubscribeUrl?: string }) {
    if (input.sender.status === "active" && liveProvidersEnabled()) {
      return this.live.send(input);
    }
    return {
      outcome: "accepted" as const,
      correlationId: `mock_${input.intent.intentId}`,
      statusCode: 200,
      detail: "mock adapter: no external send occurred",
      synthetic: true,
    };
  }
}
