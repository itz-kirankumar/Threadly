// Provider configuration and live-gate. Live provider calls additionally
// require OUTBOUND_PROVIDERS_LIVE=true, which no current deployment sets;
// activating real sending is a separate owner decision beyond consent.

import type { SenderProvider } from "../types.ts";
import type { FetchImpl, MailProviderAdapter } from "./types.ts";
import { GmailAdapter } from "./gmail.ts";
import { MicrosoftAdapter } from "./microsoft.ts";

export interface ProviderOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function gmailOAuthConfig(): ProviderOAuthConfig | null {
  const clientId = process.env.OUTBOUND_GMAIL_CLIENT_ID;
  const clientSecret = process.env.OUTBOUND_GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.OUTBOUND_GMAIL_REDIRECT_URI;
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

export function microsoftOAuthConfig(): ProviderOAuthConfig | null {
  const clientId = process.env.OUTBOUND_MS_CLIENT_ID;
  const clientSecret = process.env.OUTBOUND_MS_CLIENT_SECRET;
  const redirectUri = process.env.OUTBOUND_MS_REDIRECT_URI;
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

export function oauthConfigFor(provider: SenderProvider): ProviderOAuthConfig | null {
  return provider === "gmail" ? gmailOAuthConfig() : microsoftOAuthConfig();
}

export function requiredEnvsFor(provider: SenderProvider): string[] {
  const prefix = provider === "gmail" ? "OUTBOUND_GMAIL" : "OUTBOUND_MS";
  return [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`, `${prefix}_REDIRECT_URI`];
}

export function mailAdapter(provider: SenderProvider, fetchImpl?: FetchImpl): MailProviderAdapter {
  return provider === "gmail" ? new GmailAdapter(fetchImpl) : new MicrosoftAdapter(fetchImpl);
}

export function liveProvidersEnabled(): boolean {
  return process.env.OUTBOUND_PROVIDERS_LIVE === "true";
}
