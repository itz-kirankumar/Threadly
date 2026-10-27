// Resolves which calendar adapter a booking flow uses. Live adapters need an
// active sender whose consent trace includes the provider's calendar scope
// AND OUTBOUND_PROVIDERS_LIVE=true. Anything else falls back to the mock,
// whose events are synthetic and never count as real meetings.

import { MockCalendarAdapter, GoogleCalendarAdapter, MicrosoftCalendarAdapter } from "./providers/calendar.ts";
import type { CalendarAdapter } from "./providers/calendar.ts";
import { decryptSecret, encryptSecret } from "./token-crypto.ts";
import type { RtdbConsentStore } from "./rtdb-consent-store.ts";
import type { Sender } from "./types.ts";
import { liveProvidersEnabled, mailAdapter, oauthConfigFor } from "./providers/registry.ts";
import type { CalendarRuntime } from "./booking-flow.ts";
import type { FetchImpl, ProviderTokens } from "./providers/types.ts";

export function calendarAdapterFor(sender: Sender, fetchImpl?: FetchImpl): CalendarAdapter {
  return sender.provider === "gmail" ? new GoogleCalendarAdapter(fetchImpl) : new MicrosoftCalendarAdapter(fetchImpl);
}

export async function resolveCalendarRuntime(
  consentStore: RtdbConsentStore,
  sender: Sender | null,
  fetchImpl?: FetchImpl
): Promise<CalendarRuntime & { live: boolean }> {
  if (sender && sender.status === "active" && liveProvidersEnabled() && sender.consentTraceId) {
    const trace = await consentStore.getConsentTrace(sender.tenantId, sender.consentTraceId);
    const calendarScope = sender.provider === "gmail" ? "https://www.googleapis.com/auth/calendar.events" : "Calendars.ReadWrite";
    if (trace && !trace.revokedAt && trace.scopes.includes(calendarScope)) {
      const stored = await consentStore.getSenderTokens(sender.tenantId, sender.senderId);
      if (stored) {
        let tokens = JSON.parse(decryptSecret(stored.ciphertext)) as ProviderTokens;
        if (Date.parse(tokens.expiresAt) <= Date.now() + 60_000 && tokens.refreshToken) {
          const config = oauthConfigFor(sender.provider);
          if (config) {
            tokens = await mailAdapter(sender.provider, fetchImpl).refreshTokens({
              clientId: config.clientId,
              clientSecret: config.clientSecret,
              refreshToken: tokens.refreshToken,
              scopes: trace.scopes,
            });
            if (!tokens.refreshToken) tokens.refreshToken = JSON.parse(decryptSecret(stored.ciphertext)).refreshToken;
            await consentStore.saveSenderTokens(sender.tenantId, sender.senderId, encryptSecret(JSON.stringify(tokens)));
          }
        }
        return { adapter: calendarAdapterFor(sender, fetchImpl), accessToken: tokens.accessToken, live: true };
      }
    }
    // Live flag set but calendar consent is missing: refuse rather than
    // silently pretending to book on a real calendar.
    throw new Error("calendar_live_unconsented: sender lacks calendar-scope consent for live booking");
  }
  return { adapter: new MockCalendarAdapter(), accessToken: null, live: false };
}
