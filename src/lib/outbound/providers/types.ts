// Provider adapter contracts for outbound mail. These are real adapter
// implementations, but no code path can reach a live provider without BOTH:
// (1) a sender activated through the OAuth consent flow (status "active"
// with a consentTraceId, only possible after a real mailbox owner completes
// provider consent), and (2) the explicit OUTBOUND_PROVIDERS_LIVE deployment
// flag. Activation on a real mailbox and any live send remain separately
// gated owner decisions; the existence of this code is not activation.

import type { SenderProvider } from "../types.ts";

export interface ProviderTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string; // ISO
  scopes: string[];
}

export type SendOutcome =
  | { outcome: "accepted"; providerCorrelationId: string | null; statusCode: number | null }
  | { outcome: "rejected"; providerCorrelationId: string | null; statusCode: number | null; detail: string }
  | { outcome: "unknown"; providerCorrelationId: string | null; statusCode: number | null; detail: string };

export interface SendRequest {
  intentId: string;
  to: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  // RFC 8058: adapters emit List-Unsubscribe + List-Unsubscribe-Post headers
  // from this URL (the same capability link rendered into the body).
  listUnsubscribeUrl?: string;
}

export interface MailProviderAdapter {
  readonly provider: SenderProvider;
  // Scopes requested at consent. Send-only by default: reply ingestion and
  // calendar access are separate consent decisions with their own scopes.
  readonly consentScopes: string[];
  readonly calendarScopes: string[];
  buildConsentUrl(input: { clientId: string; redirectUri: string; state: string; loginHint: string; scopes?: string[] }): string;
  exchangeCode(input: { clientId: string; clientSecret: string; redirectUri: string; code: string; scopes?: string[] }): Promise<ProviderTokens>;
  refreshTokens(input: { clientId: string; clientSecret: string; refreshToken: string; scopes?: string[] }): Promise<ProviderTokens>;
  // Provider-reported mailbox identity, used to verify the consented mailbox
  // matches the registered sender before activation.
  fetchProfile(input: { accessToken: string }): Promise<{ email: string }>;
  // Best-effort provider-side token revocation at disconnect. Returns true
  // only when the provider confirmed; false on any failure (network, 4xx).
  // Local behavior is fail-closed regardless of this result.
  revokeTokens(input: { token: string }): Promise<boolean>;
  send(input: { accessToken: string; request: SendRequest }): Promise<SendOutcome>;
}

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
