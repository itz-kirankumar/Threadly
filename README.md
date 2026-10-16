# Wisentry

Wisentry combines the public product site with a private founder portal.

- `/` and the other public pages are the marketing site.
- `/signal-radar` has public X search when a server-side provider is configured.
- `/portal` is the Google-authenticated workspace for X discovery, saved conversations, reviewed outreach, drafts, the content calendar, leads, analytics, and company settings.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`. The Firebase web app settings are already filled for the Wisentry project.
3. In Firebase Console, open **Authentication → Sign-in method**, enable **Google**, and add your local and production domains under **Authorized domains**.
4. Publish `database.rules.json` to the Wisentry Realtime Database. The rules give each authenticated Google account access only to `/users/{uid}`. With Firebase CLI installed and authenticated, run `firebase deploy --only database`.
5. Set `APIFY_TOKEN` to enable recent X discovery. `X_BEARER_TOKEN` is an optional fallback for X API recent search.
6. Configure `LAYA_URL` and/or `ANYJEV_URL` to enable typed prospect qualification. Wisentry uses Laya for conversations containing non-English text and AnyJev for English qualification; a low-confidence result or unavailable preferred service falls back to the other configured service. Run Laya's `laya-serve` and AnyJev's Tacit `/v1/decide` service behind private networking. AnyJev's built-in HTTP gateway has no authentication, so do not expose it publicly. Optional `LAYA_API_KEY` and `ANYJEV_API_KEY` values are sent as bearer tokens when the service or proxy supports them.
7. Optional `OPENAI_API_KEY` and/or `GEMINI_API_KEY` enable free-form text generation for website summaries, content variations, and personalized email drafts. Laya and AnyJev make typed decisions; they do not generate prose. `OPENAI_MODEL` and `GEMINI_MODEL` select the text-generation model IDs.
8. For one-at-a-time in-app email delivery, configure Amazon SES with `USE_AWS=true`, `AWS_REGION`, and a verified `FROM_EMAIL`; provide AWS credentials through the normal AWS SDK credential chain (prefer an IAM role). Without SES, reviewed drafts can still open in your email app.
9. Run `npm run dev`.

## Outreach workflow

Open **Outreach** in the portal, analyze a public HTTPS company website, and review the suggested customer profile and search phrases. Search recent public X conversations, add relevant posts to the prospect list, and enter a verified contact email yourself. Use **Assess fit** to qualify a prospect with Laya or AnyJev. Laya handles multilingual text; AnyJev handles English typed decisions and confidence. The other service is used when the preferred service is unavailable or uncertain. These scores help prioritize review; they do not prove someone is a buyer. Generate and edit a one-to-one email, then confirm before sending. A personal booking URL can be added to the workspace and included in new drafts; recipients choose a time on that booking page.

Website analysis and drafts send the page text or selected conversation details to the configured AI provider. Website fetching is restricted to public HTTPS hosts and limited in size and redirects. Emails are stored under the signed-in Firebase user. Wisentry does not send sequences automatically.

The portal verifies Firebase ID tokens on its API routes and uses them for Realtime Database REST calls. It does not require a service account or public database rules. Analytics initializes in supported browsers.

## Production setup

Use Node.js 22 or newer. Build and host the Next.js app on a Node runtime that supports API routes and the `better-sqlite3` native module. The production environment must provide:

- The Firebase web settings and server-side Firebase API key from `.env.example`. Enable Google sign-in and authorize the production hostname in Firebase Authentication.
- The checked-in Realtime Database rules deployed to the Wisentry Firebase project. Keep rules scoped to each signed-in user's `/users/{uid}` data.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Shared rate limiting protects X search, website analysis, AI actions, waitlist, and community endpoints. The app uses a bounded in-memory limiter only during local development and fails closed in production when Redis is missing or unavailable.
- Persistent storage for public waitlist/community signups. Prefer DynamoDB by setting `USE_DYNAMODB=true`, `APP_AWS_REGION`, and the table names. Create `Wisentry_Waitlist` with string partition key `id` and `Wisentry_Community` with string partition key `email`; give the runtime IAM role only `dynamodb:PutItem` access to those tables. The AWS SDK credential chain is used when static credentials are not supplied. `WISENTRY_DB_PATH` is supported only when the host provides durable writable storage; the default local SQLite path is not treated as production persistence.

Optional integrations can be enabled independently: configure `APIFY_TOKEN` or `X_BEARER_TOKEN` for X search, `OPENAI_API_KEY` and/or `GEMINI_API_KEY` for text generation, `LAYA_URL` and/or `ANYJEV_URL` for prospect decisions, and `USE_AWS=true` with a verified `FROM_EMAIL` for reviewed SES mail. Use private networking for model services. Never expose AnyJev's unauthenticated gateway publicly. Do not put server credentials in `NEXT_PUBLIC_*` variables.

`GET /api/health` reports whether core production configuration is present without returning secrets. Before release, run `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm audit`. Set `NODE_ENV=production` in the host and verify Google sign-in, one user's data isolation, rate-limit behavior, X provider failures, email confirmation, and backup/restore procedures in a staging project first.

Configure the hosting proxy to overwrite `x-real-ip` and `x-forwarded-for` with the actual client address; the public form and unauthenticated search quotas use those headers as rate-limit keys.

Portal records are stored in Firebase Realtime Database under `users/{uid}`. Waitlist/community data uses DynamoDB when `USE_DYNAMODB=true` or SQLite on a persistent local server. The public signup endpoints are rate-limited, validate field lengths, and return generic infrastructure errors.
