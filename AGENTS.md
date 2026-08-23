# ParcelTrack — Agent Instructions

## Core Purpose

ParcelTrack is a hybrid package-tracking application.

It allows an administrator to create packages, connect carrier tracking numbers, manually add shipment updates, and generate private tracking links for customers.

Customers do not create accounts or sign in. They open their private tracking link to view their package status and tracking history.

The application combines:

1. Automatic tracking events from DHL and other delivery companies.
2. Manual tracking events added by the administrator.

The customer-facing timeline must clearly show the source of every update.

## User Roles

### Customer

A customer can:

- Open a private package-tracking link.
- View the current package status.
- View the latest known location.
- View the carrier and partially hidden tracking number.
- View the estimated delivery date when available.
- View a chronological tracking timeline.
- See whether an update came from the carrier or the shipping administrator.

Customers do not need accounts.

### Administrator

The administrator can:

- Sign in through a secure admin login.
- Create, edit, search, and manage packages.
- Add carrier names and tracking numbers.
- Generate and copy private customer tracking links.
- Add manual status, location, date, time, and description updates.
- Refresh tracking information from connected carriers.
- View all automatic and manual events.
- Mark packages delivered, delayed, returned, cancelled, or affected by an exception.

The administrator area must be authenticated. Do not implement an unsecured or hidden “backdoor” route.

## Core Package Flow

1. The administrator signs in.
2. The administrator creates a package.
3. The administrator enters an order reference, carrier, tracking number, and destination information.
4. The application generates a cryptographically secure public tracking token.
5. The customer receives a link such as `/track/{publicToken}`.
6. The carrier integration retrieves tracking events using the tracking number.
7. Carrier webhooks add new carrier events automatically.
8. The administrator can add separate manual updates.
9. The customer page combines both event types into one chronological timeline.
10. Every event displays its source.

## Tracking Event Sources

Every tracking event must have one of these sources:

- `CARRIER`: Information received from DHL or another carrier.
- `ADMIN`: Information manually entered by the administrator.
- `SYSTEM`: Internal application events, when necessary.

Never display an administrator update as an official carrier update.

Carrier events and administrator events must be stored separately or remain distinguishable through their source field.

## Initial Shipment Statuses

Use a consistent shipment-status model:

- `PENDING`
- `INFO_RECEIVED`
- `PICKED_UP`
- `IN_TRANSIT`
- `CUSTOMS`
- `OUT_FOR_DELIVERY`
- `DELIVERED`
- `DELAYED`
- `EXCEPTION`
- `RETURNED`
- `CANCELLED`

Do not create new status names without checking whether an existing status is suitable.

## Data Integrity

- Never fabricate carrier information.
- Preserve the original carrier event data where practical.
- Manual updates may supplement carrier information but must remain labelled as administrator updates.
- Store timestamps for packages and tracking events.
- Keep an audit trail of administrator changes.
- Do not silently delete or overwrite tracking history.
- Sort the customer timeline chronologically.
- Handle duplicated carrier webhooks safely.

## Privacy and Security

- Customer tracking tokens must be cryptographically secure and unguessable.
- Do not expose sequential database IDs in public tracking URLs.
- Never expose administrator credentials, database credentials, webhook secrets, or carrier API keys to the browser.
- Store secrets only in environment variables.
- Protect all admin pages, server actions, and API endpoints.
- Validate and authenticate carrier webhook requests.
- Validate all administrator input.
- Rate-limit public tracking endpoints when implemented.
- Avoid displaying complete street addresses, phone numbers, or unnecessary personal information publicly.
- Mask tracking numbers where appropriate.

## Technical Direction

Use:

- Next.js App Router
- TypeScript strict mode
- Tailwind CSS
- PostgreSQL
- Prisma ORM
- Server Components by default
- Server Actions or route handlers for protected mutations
- A multi-carrier tracking provider through a replaceable adapter interface

Carrier-provider code must not be tightly coupled to UI components. The application should be able to replace 17TRACK with another provider later.

## Development Workflow

For every task:

1. Inspect existing code before editing.
2. Work on only the requested feature.
3. Preserve unrelated user changes.
4. Keep changes small and independently testable.
5. Avoid unnecessary dependencies.
6. Avoid `any` unless there is a documented reason.
7. Add or update tests for important behavior.
8. Run lint, typecheck, tests, and build.
9. Fix failures before completing the task.
10. Review the final diff for regressions.
11. Report changed files and verification results.
12. Stop after the requested feature is complete.

## Commands

Use the scripts available in `package.json`.

Before completing a task, run at minimum:

- `npm run lint`
- `npm run typecheck`
- `npm test` when a test script exists
- `npm run build`

## Current Scope

The current implementation includes the project, shipment-domain database, administrator authentication, package management, manual administrator updates, and private public-token tracking.

Do not implement the following until a later prompt requests them:

- Carrier API integration
- Carrier webhooks
- Production deployment

## Deployment Trust Boundary

The initial production target is Vercel with no proxy in front. Public client identity uses Vercel's official request helper. Adding a CDN, load balancer, or reverse proxy requires revisiting and testing client-IP resolution before deployment.

## Database Commands

- `npm run db:dev`: start the named local Prisma Postgres instance
- `npm run db:migrate`: create and apply development migrations
- `npm run db:seed`: seed the fake demonstration shipment idempotently
- `npm run db:studio`: inspect the local database

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
