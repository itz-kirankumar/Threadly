// Microsoft Graph adapter. sendMail returns 202 Accepted: per PRD that means
// accepted, not delivered. Timeout/5xx map to "unknown" (quarantined, never
// blind-retried).

import type { FetchImpl, MailProviderAdapter, ProviderTokens, SendOutcome, SendRequest } from "./types.ts";

const AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const SEND_URL = "https://graph.microsoft.com/v1.0/me/sendMail";
const PROFILE_URL = "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";

async function tokenRequest(fetchImpl: FetchImpl, params: Record<string, string>): Promise<ProviderTokens> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`microsoft token exchange failed: HTTP ${res.status}`);
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

export class MicrosoftAdapter implements MailProviderAdapter {
  readonly provider = "microsoft" as const;
  readonly consentScopes = ["offline_access", "Mail.Send"];
  readonly calendarScopes = ["offline_access", "Calendars.ReadWrite"];

  private readonly fetchImpl: FetchImpl;

  constructor(fetchImpl: FetchImpl = (url, init) => fetch(url, init)) {
    this.fetchImpl = fetchImpl;
  }

  buildConsentUrl(input: { clientId: string; redirectUri: string; state: string; loginHint: string; scopes?: string[] }): string {
    const params = new URLSearchParams({
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: (input.scopes ?? this.consentScopes).join(" "),
      state: input.state,
      login_hint: input.loginHint,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(input: { clientId: string; clientSecret: string; redirectUri: string; code: string; scopes?: string[] }): Promise<ProviderTokens> {
    return tokenRequest(this.fetchImpl, {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      code: input.code,
      grant_type: "authorization_code",
      scope: (input.scopes ?? this.consentScopes).join(" "),
    });
  }

  async refreshTokens(input: { clientId: string; clientSecret: string; refreshToken: string; scopes?: string[] }): Promise<ProviderTokens> {
    return tokenRequest(this.fetchImpl, {
      client_id: input.clientId,
      client_secret: input.clientSecret,
      refresh_token: input.refreshToken,
      grant_type: "refresh_token",
      scope: (input.scopes ?? this.consentScopes).join(" "),
    });
  }

  async fetchProfile(input: { accessToken: string }): Promise<{ email: string }> {
    const res = await this.fetchImpl(PROFILE_URL, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`microsoft profile lookup failed: HTTP ${res.status}`);
    const data = (await res.json()) as { mail?: string; userPrincipalName?: string };
    const email = data.mail || data.userPrincipalName;
    if (!email) throw new Error("microsoft profile lookup returned no email address");
    return { email };
  }

  async send(input: { accessToken: string; request: SendRequest }): Promise<SendOutcome> {
    let res: Response;
    try {
      res = await this.fetchImpl(SEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: input.request.subject,
            body: { contentType: "Text", content: input.request.bodyText },
            toRecipients: [{ emailAddress: { address: input.request.to } }],
            ...(input.request.listUnsubscribeUrl
              ? {
                  internetMessageHeaders: [
                    { name: "List-Unsubscribe", value: `<${input.request.listUnsubscribeUrl}>` },
                    { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
                  ],
                }
              : {}),
          },
          saveToSentItems: true,
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      return { outcome: "unknown", providerCorrelationId: null, statusCode: null, detail: `network/timeout: ${String(error)}` };
    }
    // 202 Accepted = handed to the provider, not delivered.
    if (res.status === 202) {
      return { outcome: "accepted", providerCorrelationId: res.headers.get("request-id"), statusCode: res.status };
    }
    if (res.status === 429 || res.status >= 500) {
      return { outcome: "unknown", providerCorrelationId: null, statusCode: res.status, detail: `provider throttling/server error HTTP ${res.status}` };
    }
    const detail = await res.text().catch(() => "");
    return { outcome: "rejected", providerCorrelationId: null, statusCode: res.status, detail: detail.slice(0, 500) };
  }
}
