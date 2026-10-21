# Threadly

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Threadly combines the public product site with a private founder portal.

- `/` and the other public pages are the marketing site.
- `/signal-radar` has public X search when a server-side provider is configured.
- `/portal` is the Google-authenticated workspace for X discovery, saved conversations, reviewed outreach, drafts, the content calendar, leads, analytics, and company settings.
- The portal's **GEO** workspace tracks buyer questions and performs on-demand web-grounded scans through configured OpenAI and Gemini API keys. Results include provider-returned source URLs; unconfigured providers do not produce sample results.
- `/admin/waitlist` is the Google-authenticated beta review portal. `kiran160703kumar@gmail.com` can approve or reject requests and has direct workspace access; other accounts need an approved request to use the workspace and its APIs.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`. The Firebase web app settings are already filled for the Wisentry project.
3. In Firebase Console, open **Authentication → Sign-in method**, enable **Google**, and add your local and production domains under **Authorized domains**. Homepage beta requests require Google sign-in.
4. Publish `database.rules.json` to the Wisentry Realtime Database. The rules scope workspace records and rate limits to each signed-in account, store waitlist requests by Firebase UID, and allow only `kiran160703kumar@gmail.com` to review the waitlist. With Firebase CLI installed and authenticated, run `firebase deploy --only database`.
5. Set `APIFY_TOKEN` to enable recent X discovery. `X_BEARER_TOKEN` is an optional fallback for X API recent search.
6. Configure `LAYA_URL` and/or `ANYJEV_URL` to enable typed prospect qualification. Wisentry uses Laya for conversations containing non-English text and AnyJev for English qualification; a low-confidence result or unavailable preferred service falls back to the other configured service. Run Laya's `laya-serve` and AnyJev's Tacit `/v1/decide` service behind private networking. AnyJev's built-in HTTP gateway has no authentication, so do not expose it publicly. Optional `LAYA_API_KEY` and `ANYJEV_API_KEY` values are sent as bearer tokens when the service or proxy supports them.
7. Optional `OPENAI_API_KEY` and/or `GEMINI_API_KEY` enable free-form text generation for website summaries, content variations, and personalized email drafts. Laya and AnyJev make typed decisions; they do not generate prose. `OPENAI_MODEL` and `GEMINI_MODEL` select the text-generation model IDs.
8. For one-at-a-time in-app email delivery, configure Amazon SES with `USE_AWS=true`, `AWS_REGION`, and a verified `FROM_EMAIL`; provide AWS credentials through the normal AWS SDK credential chain (prefer an IAM role). This optional mail integration is separate from beta waitlist storage, which uses Firebase.
9. For Threadly beta emails, create a Resend API key and set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO`, and `APP_BASE_URL` in `.env.local` (details below).
10. Run `npm run dev`.

## Threadly beta email setup

The app sends an HTML confirmation after a first waitlist submission and an HTML approval email when an admin changes a request to approved. Email delivery is server-side; the waitlist decision is saved even if Resend is unavailable. The applicant sees a confirmation message, and the admin portal reports an approval email failure so it can be retried after fixing configuration.

1. In Resend, create an API key and keep it private. Add the API key to `.env.local` as `RESEND_API_KEY` for local development. Add the same key as a server-side environment variable named `RESEND_API_KEY` in Vercel for Production (and Preview if needed). Never use a `NEXT_PUBLIC_` prefix or commit the key.
2. In Resend, open the `gothreadly.live` domain and copy the exact DNS record names, types, and values shown on its **Records** tab. Add them in **Vercel → Domains → gothreadly.live → DNS Records** because the domain now uses Vercel nameservers. Enter each record's host/name, type, and full value exactly as Resend displays. Do not add the domain name twice to the host field.
3. Once the records have propagated, click **Verify DNS Records** in Resend. A verified domain is required before Resend can send from it. Copy each record exactly; the Resend dashboard is authoritative for record values and types.
4. Set `RESEND_FROM_EMAIL` to `Threadly <beta@gothreadly.live>` (or another sender on the verified domain), `RESEND_REPLY_TO` to the support address, and `APP_BASE_URL` to `https://gothreadly.live`. Set these in both `.env.local` and Vercel. Redeploy Vercel after changing production environment variables.
5. Submit a test waitlist request using a Google account, then approve it at `/admin/waitlist`. Check Resend **Emails/Logs** for each send. If approval sending fails, fix the key/domain/sender configuration, return the request to pending in the admin portal, and approve it again to retry.

## Outreach workflow

Open **Outreach** in the portal, analyze a public HTTPS company website, and review the suggested customer profile and search phrases. Search recent public X conversations, add relevant posts to the prospect list, and enter a verified contact email yourself. Use **Assess fit** to qualify a prospect with Laya or AnyJev. Laya handles multilingual text; AnyJev handles English typed decisions and confidence. The other service is used when the preferred service is unavailable or uncertain. These scores help prioritize review; they do not prove someone is a buyer. Generate and edit a one-to-one email, then confirm before sending. A personal booking URL can be added to the workspace and included in new drafts; recipients choose a time on that booking page.

Website analysis and drafts send the page text or selected conversation details to the configured AI provider. Website fetching is restricted to public HTTPS hosts and limited in size and redirects. Emails are stored under the signed-in Firebase user. Wisentry does not send sequences automatically.

The portal verifies Firebase ID tokens on its API routes and uses them for Realtime Database REST calls. It does not require a service account or public database rules. Analytics initializes in supported browsers.

## Production setup

Use Node.js 22 or newer and host the Next.js app on a Node runtime that supports API routes. The production environment must provide:

- The Firebase web settings and server-side Firebase API key from `.env.example`. Enable Google sign-in and authorize the production hostname in Firebase Authentication.
- The checked-in Realtime Database rules deployed to the Wisentry Firebase project. Beta requests, community signups, and per-user rate counters are stored in Firebase. Do not broaden the database rules to public reads or writes.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` to deliver waitlist confirmation and approval emails. Email reply-to and site URL are configured with `RESEND_REPLY_TO` and `APP_BASE_URL`.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are optional and used only to rate limit anonymous public X searches. Authenticated APIs use atomic rate counters in Firebase and remain available without Upstash. If Upstash is not configured, anonymous X searches fail closed.

Optional integrations can be enabled independently: configure `APIFY_TOKEN` or `X_BEARER_TOKEN` for X search, `OPENAI_API_KEY` and/or `GEMINI_API_KEY` for text generation, `LAYA_URL` and/or `ANYJEV_URL` for prospect decisions, and `USE_AWS=true` with a verified `FROM_EMAIL` for reviewed SES mail. Use private networking for model services. Never expose AnyJev's unauthenticated gateway publicly. Do not put server credentials in `NEXT_PUBLIC_*` variables.

GEO scans use the OpenAI Responses API web search tool and Gemini Google Search grounding. Set `GEO_BRAND_DOMAIN` (defaults to `gothreadly.live`) and one or both provider keys. Optional `GEO_OPENAI_MODEL` and `GEO_GEMINI_MODEL` override model IDs. Scans are manual and make a billable request for each configured provider and tracked question; the dashboard counts a citation only when a provider-returned source URL matches the tracked domain. Search results are provider snapshots, not a guaranteed reproduction of each consumer-facing AI product.

`GET /api/health` reports core Firebase and Resend configuration without returning secrets. Its `anonymousRateLimitStore` check indicates whether public unauthenticated X search is available. Before release, run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm audit`. Set `NODE_ENV=production` in the host and verify Google sign-in, one user's data isolation, rate-limit behavior, X provider failures, email confirmation, and backup/restore procedures in a staging project first.

Configure the hosting proxy to overwrite `x-real-ip` and `x-forwarded-for` with the actual client address if public anonymous endpoints are enabled; those quotas use the forwarded client address as their rate-limit key.

Portal records are stored in Firebase Realtime Database under `users/{uid}`. Beta requests are stored at `betaWaitlist/{uid}` and community signups at `communityMembers/{uid}`. Beta requests are bound to the verified Google account, reviewed at `/admin/waitlist`, and workspace access checks the approved status on both the page and API routes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

