# ParcelTrack production deployment runbook

ParcelTrack's initial production boundary is Next.js on Vercel with managed
PostgreSQL and no proxy in front. Preview and Production are separate Vercel
environments. Complete each controlled phase in order. The build orchestrator
runs committed migrations immediately before a genuine Vercel Production
build; application startup and the demo seed never run migrations.

## Environment manifest

No variable is browser-public and none may use a `NEXT_PUBLIC_` prefix.

| Variable | Production | Preview | Development |
| --- | --- | --- | --- |
| `DATABASE_URL` | Required, managed production PostgreSQL | Required, separate non-production PostgreSQL | Required for database work |
| `DATABASE_POOL_MAX` | Optional; defaults to `2`, range `1`–`10` | Optional, conservative | Optional |
| `BETTER_AUTH_SECRET` | Required, independent secret | Invented non-production secret | Required for authentication testing |
| `BETTER_AUTH_URL` | Required canonical HTTPS origin | Explicit preview test origin only if authentication is enabled | `http://localhost:3000` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Required explicit HTTPS allowlist containing the canonical origin | Explicit non-production origins only; never `*.vercel.app` | `http://localhost:3000` |
| `PUBLIC_TRACKING_HMAC_SECRET` | Required, independent secret | Invented non-production secret | Invented local secret |
| `TRACKING_PROVIDER` | Optional; defaults to `disabled` | Must be `disabled` | `disabled` unless intentionally testing |
| `TRACKING_PROVIDER_API_KEY` | Required only when provider is `17track` | Never use the production key | Optional local test key only |
| `TRACKING_WEBHOOK_SECRET` | Required and independent when provider is `17track` | Never use the production secret | Optional invented local value |
| `SHIP24_API_KEY` | Required only when provider is `ship24` | Never use the production key | Optional invented local value only |
| `SHIP24_WEBHOOK_SECRET` | Required only when the Ship24 webhook is activated; independent from its API key | Never use the production secret | Optional invented local value only |
| `SHADOW_DATABASE_URL` | Not used | Not used | Development migrations only |

`VERCEL`, `VERCEL_ENV`, `VERCEL_URL`, and
`VERCEL_PROJECT_PRODUCTION_URL` are Vercel-provided. ParcelTrack does not use a
generated preview hostname as an authentication trust wildcard. `RUN_DB_TESTS`
is test-only.

Validate presence, URL shape, HTTPS, secret lengths, provider consistency, and
pool bounds without connecting to any service:

```text
npm run deployment:check
```

The check prints variable names on failure, never their values.

## Phase 1 — Accounts and infrastructure

1. Push `main` to GitHub.
2. Create or connect the Vercel project.
3. Create a managed production PostgreSQL database.
4. Obtain its production connection URL without placing it in Git or chat.
5. Review the provider's current plan, TLS behavior, pooling guidance, and
   connection limits. Keep `DATABASE_POOL_MAX` conservative.

## Phase 2 — Vercel environment

Configure the manifest above separately for Production, Preview, and
Development. Production secrets must be scoped only to Production and must not
be automatically exposed to Preview deployments. Preview must use a separate
non-production database (or no Preview deployment), `TRACKING_PROVIDER=disabled`,
invented secrets, no production provider/webhook credentials, and no production
administrator.

Ship24 activation is a separate controlled release step. Keep Production and
Preview credentials isolated, treat free-plan tracker quota as scarce, and
prefer webhooks to polling. One tracker generally represents one shipment.
ParcelTrack transmits no recipient name, email, telephone, address, or
postcode. The API key and webhook Bearer secret are independent.

Run `npm run deployment:check` with the intended environment before release.
Changing an environment variable requires a new deployment.

## Phase 3 — Database release

`npm run build` uses `scripts/build.mjs`. Only when both `VERCEL=1` and
`VERCEL_ENV=production` are present does it run `npm run db:deploy` before
`next build`. Preview, Vercel development, and local builds skip database
migrations. An unknown Vercel environment fails closed.

`db:deploy` runs the idempotent `prisma migrate deploy`; a migration failure
prevents `next build` and therefore prevents deployment promotion. Prisma
Client generation remains in `postinstall`. Never run `db:migrate`, `migrate
dev`, `db push`, reset, or the demo seed in Production. Schema migrations must
remain backward-compatible with the currently deployed application whenever
possible because the previous deployment continues serving traffic during the
build.

## Phase 4 — Application deployment

1. Deploy the application.
2. Attach the final custom domain if applicable.
3. Set `BETTER_AUTH_URL` to that exact HTTPS origin and include the same origin
   in `BETTER_AUTH_TRUSTED_ORIGINS`.
4. Redeploy after any origin change.
5. Verify HTTPS before enabling authentication or carrier traffic.

## Phase 5 — First administrator

Use the existing Better Auth interactive administrator creation command. Never
put a password on the command line. The CLI has a known `server-only` resolution
issue in this project; the previously verified controlled procedure is:

1. Confirm the Git working tree is clean.
2. Temporarily remove `import "server-only";` from both `src/lib/auth.ts` and
   `src/lib/prisma.ts` without committing either file.
3. Run `npx auth@latest create-admin --config src/lib/auth.ts --email
   ADMIN_EMAIL --name "ParcelTrack Admin" --role admin` and enter the password
   only at the secure interactive prompt.
4. Immediately restore both imports, even if the CLI fails.
5. Verify the administrator and admin role, confirm the diff for both files is
   empty, and confirm the working tree is clean.

Do not place an administrator email or password in this runbook, shell history,
Git, screenshots, logs, issue reports, or chat.

## Phase 6 — 17TRACK

1. Set `TRACKING_PROVIDER=17track` in Production.
2. Set the production provider API key.
3. Set the independent webhook security key.
4. Redeploy.
5. Configure the final HTTPS URL
   `https://your-domain.example/api/webhooks/17track` in 17TRACK.
6. Run the dashboard webhook tester and confirm HTTP 200.
7. Register one controlled test shipment and confirm automatic updates.
8. Keep outbound IP allowlisting disabled unless Vercel Static IPs or another
   stable outbound-IP solution is configured.

## Phase 7 — Production verification

Verify the homepage, admin login, protected admin redirect, authenticated admin
access, package creation, manual updates, private public-tracking link and DTO,
Vercel-IP public rate limiting, carrier registration, manual provider sync,
signed webhook update, duplicate webhook acknowledgement, invalid-signature
rejection, and administrator sign-out.

Inspect response headers for HSTS, `nosniff`, referrer policy, permissions
policy, clickjacking protection, cache restrictions, and tracking-page
`noindex`/`no-referrer`. Confirm browser bundles and HTTP responses contain no
database URL, credentials, session/auth secrets, HMAC secret, provider keys,
webhook secret/signature/body, full tracking number, public token outside its
private URL, or recipient data beyond the intentional customer DTO.

A Content Security Policy remains a later hardening task. Add it only after
testing all Next.js scripts, styles, forms, and authentication flows; a broken
CSP must not be introduced during deployment preparation.
