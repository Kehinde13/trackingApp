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

This checkpoint deliberately has no webhooks, cron jobs, or scheduled polling.
For the initial direct-Vercel deployment, leave 17TRACK IP allowlisting disabled
unless Vercel Static IPs or another stable outbound-IP solution is configured.

## Public tracking deployment boundary

The initial production target is direct Vercel with no proxy in front. Public
rate limiting resolves client addresses with the official `@vercel/functions`
helper and immediately stores only a domain-separated HMAC made with
`BETTER_AUTH_SECRET`. Local development uses one shared identity. Vercel
requests without an IP use a shared five-request fail-safe bucket; production
outside Vercel fails closed.

Adding Cloudflare, a CDN, load balancer, or another reverse proxy requires a
fresh client-IP trust review before public tracking can be enabled there.
