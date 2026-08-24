# ParcelTrack

ParcelTrack is a Next.js package-tracking application. This repository currently
contains the application and shipment-domain database foundation.

## Local development

Requirements: Node.js 20.19 or newer and npm.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` without overwriting an existing `.env`.
3. Start local Prisma Postgres: `npm run db:dev`
4. Press `t` in the Prisma terminal, then put the displayed TCP PostgreSQL URL in
   `.env` as `DATABASE_URL`. Set `SHADOW_DATABASE_URL` to the shadow TCP URL
   reported for the same named instance; it uses the dedicated shadow database
   port shown by `prisma dev`.
5. In another terminal, create/apply migrations: `npm run db:migrate`
6. Seed the clearly fake demonstration shipment: `npm run db:seed`
7. Start Next.js: `npm run dev`
8. Open Prisma Studio when needed: `npm run db:studio`

Keep the Prisma Postgres process running while migrating, seeding, using Studio,
or running the application. Press `q` in its terminal when finished.

Useful checks are `npm run db:validate`, `npm run db:generate`, `npm test`,
`npm run lint`, `npm run typecheck`, and `npm run build`.

Production preparation and the controlled Vercel/PostgreSQL release sequence
are documented in [`docs/deployment.md`](docs/deployment.md). Run
`npm run deployment:check` against an intended production configuration before
release; it performs offline validation and never connects to the database or a
provider. Production migrations use the separate `npm run db:deploy` command
and the demo seed is never run in production.

## Administrator authentication

Generate a local secret with `npx auth@latest secret`, then add the value to
`.env` as `BETTER_AUTH_SECRET`. Keep `BETTER_AUTH_URL` and
`BETTER_AUTH_TRUSTED_ORIGINS` set to the exact origin that serves the app.

After applying migrations, create the first administrator interactively. Omit
`--password` so the password is requested securely instead of being saved in
shell history:

`npx auth@latest create-admin --config src/lib/auth.ts --email you@example.com --name "ParcelTrack Admin" --role admin`

Public sign-up is disabled. Administrators sign in at `/admin/login`.

## Carrier tracking providers

Carrier integration is isolated behind a server-only provider interface. The
current implementations are a disabled provider, the 17TRACK Tracking API v2.4
adapter, and a quota-free fake provider for automated tests. No provider key,
raw response, request header, or internal diagnostic field is returned publicly.

Local development defaults to `TRACKING_PROVIDER="disabled"`. To enable
17TRACK, set `TRACKING_PROVIDER="17track"` and set
`TRACKING_PROVIDER_API_KEY` to the secret API key in the local or deployment
environment. Never put a real value in `.env.example` or a tracked file.

From a protected package-detail page, an administrator registers an eligible
tracking number (optionally supplying the numeric 17TRACK carrier code), then
uses **Sync now** to import immutable carrier events. Synchronization is
idempotent and carrier events remain visibly distinct from administrator events.
Unknown provider statuses are recorded as a safe warning and do not change the
shipment status.

This checkpoint deliberately has no cron jobs or scheduled polling.
For the initial direct-Vercel deployment, leave 17TRACK IP allowlisting disabled
unless Vercel Static IPs or another stable outbound-IP solution is configured.

## 17TRACK webhooks

Automatic carrier updates arrive at `POST /api/webhooks/17track`. This public
machine endpoint does not use administrator cookies, CORS, or the public
tracking rate limiter. It reads at most 512 KiB from the exact raw UTF-8 body
and verifies the `sign` header before JSON parsing using
`SHA-256(rawBody + "/" + TRACKING_WEBHOOK_SECRET)` and constant-time comparison.
The webhook security key is independent from `TRACKING_PROVIDER_API_KEY` and
must only exist in server-side environment configuration.

Authenticated `TRACKING_UPDATED` and `TRACKING_STOPPED` events are supported.
Updates only match shipments already connected to 17TRACK; they never create a
shipment. Unknown event types and unmatched shipments receive a generic 200
acknowledgement. Responses never contain shipment data. Authentication,
validation, oversize, and temporary database failures return generic 401, 400,
413, and 503 responses respectively.

Each authenticated payload has a minimal receipt keyed by a domain-separated
hash of the exact body. This provides idempotent replay handling but is not
proof that a payload is recent because the documented signature has no
timestamp. Receipts contain neither tracking numbers nor payloads and are
opportunistically removed after 30 days. Event uniqueness remains a second
deduplication layer. Provider payloads, signatures, headers, addresses, phone
data, coordinates, recipient data, and secrets are not persisted.

Deployment steps:

1. Deploy to the final HTTPS Vercel domain.
2. Generate or retrieve the webhook security key in the 17TRACK dashboard.
3. Save it as `TRACKING_WEBHOOK_SECRET` in Vercel environment variables.
4. Redeploy.
5. Configure `https://your-domain.example/api/webhooks/17track` in 17TRACK.
6. Run the dashboard webhook tester and confirm HTTP 200.

Never paste the webhook secret into documentation, Git, screenshots, issue
reports, or chat. This implementation does not add polling, cron, queues, or a
webhook configuration interface.

## Public tracking deployment boundary

The initial production target is direct Vercel with no proxy in front. Public
rate limiting resolves client addresses with the official `@vercel/functions`
helper and immediately stores only a domain-separated HMAC made with
the independent `PUBLIC_TRACKING_HMAC_SECRET`. Local development uses one shared identity. Vercel
requests without an IP use a shared five-request fail-safe bucket; production
outside Vercel fails closed.

Adding Cloudflare, a CDN, load balancer, or another reverse proxy requires a
fresh client-IP trust review before public tracking can be enabled there.
