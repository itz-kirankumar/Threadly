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
}

export interface MailProviderAdapter {
  readonly provider: SenderProvider;
  // Scopes requested at consent. Send-only by default: reply ingestion needs
  // additional restricted scopes and is a separate consent decision.
  readonly consentScopes: string[];
  buildConsentUrl(input: { clientId: string; redirectUri: string; state: string; loginHint: string }): string;
  exchangeCode(input: { clientId: string; clientSecret: string; redirectUri: string; code: string }): Promise<ProviderTokens>;
  refreshTokens(input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<ProviderTokens>;
  // Provider-reported mailbox identity, used to verify the consented mailbox
  // matches the registered sender before activation.
  fetchProfile(input: { accessToken: string }): Promise<{ email: string }>;
  send(input: { accessToken: string; request: SendRequest }): Promise<SendOutcome>;
}

export type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;
