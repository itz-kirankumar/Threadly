// Gmail adapter. Send-only scope at consent (gmail.send is a sensitive
// scope; reply-ingestion restricted scopes are a separate consent decision).
// Timeout and 5xx after submission map to "unknown" - an ambiguous send is
// quarantined for reconciliation, never blind-retried.

import type { FetchImpl, MailProviderAdapter, ProviderTokens, SendOutcome, SendRequest } from "./types.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

function base64url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildMime(request: SendRequest): string {
  const subject = `=?UTF-8?B?${Buffer.from(request.subject, "utf8").toString("base64")}?=`;
  const body = Buffer.from(request.bodyText, "utf8").toString("base64");
  return [
    `To: ${request.to}`,
    `From: ${request.fromEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
}

async function tokenRequest(fetchImpl: FetchImpl, params: Record<string, string>): Promise<ProviderTokens> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`gmail token exchange failed: HTTP ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  const expiresAt = new Date(Date.now() + (typeof data.expires_in === "number" ? data.expires_in : 3600) * 1000).toISOString();
  return {
    accessToken: data.access_token,
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : null,
    expiresAt,
    scopes: typeof data.scope === "string" ? data.scope.split(" ").filter(Boolean) : [],
  };
}

export class GmailAdapter implements MailProviderAdapter {
  readonly provider = "gmail" as const;
  readonly consentScopes = ["https://www.googleapis.com/auth/gmail.send"];

  private readonly fetchImpl: FetchImpl;

  constructor(fetchImpl: FetchImpl = (url, init) => fetch(url, init)) {
    this.fetchImpl = fetchImpl;
  }

  buildConsentUrl(input: { clientId: string; redirectUri: string; state: string; loginHint: string }): string {
    const params = new URLSearchParams({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      scope: this.consentScopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      state: input.state,
      login_hint: input.loginHint,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(input: { clientId: string; clientSecret: string; redirectUri: string; code: string }): Promise<ProviderTokens> {
    return tokenRequest(this.fetchImpl, {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      grant_type: "authorization_code",
    });
  }

  async refreshTokens(input: { clientId: string; clientSecret: string; refreshToken: string }): Promise<ProviderTokens> {
    return tokenRequest(this.fetchImpl, {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
    });
  }

  async fetchProfile(input: { accessToken: string }): Promise<{ email: string }> {
    const res = await this.fetchImpl(PROFILE_URL, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`gmail profile lookup failed: HTTP ${res.status}`);
    const data = (await res.json()) as { emailAddress?: string };
    if (!data.emailAddress) throw new Error("gmail profile lookup returned no email address");
    return { email: data.emailAddress };
  }

  async send(input: { accessToken: string; request: SendRequest }): Promise<SendOutcome> {
    let res: Response;
    try {
      res = await this.fetchImpl(SEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw: base64url(buildMime(input.request)) }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      return { outcome: "unknown", providerCorrelationId: null, statusCode: null, detail: `network/timeout: ${String(error)}` };
    }
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return { outcome: "accepted", providerCorrelationId: typeof data.id === "string" ? data.id : null, statusCode: res.status };
    }
    if (res.status === 429 || res.status >= 500) {
      return { outcome: "unknown", providerCorrelationId: null, statusCode: res.status, detail: `provider throttling/server error HTTP ${res.status}` };
    }
    const detail = await res.text().catch(() => "");
    return { outcome: "rejected", providerCorrelationId: null, statusCode: res.status, detail: detail.slice(0, 500) };
  }
}
