# ParcelTrack

ParcelTrack is a Next.js package-tracking application. This repository currently
contains the application and shipment-domain database foundation.

## Local development

Requirements: Node.js 20.19 or newer and npm.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` without overwriting an existing `.env`.
3. Start local Prisma Postgres: `npm run db:dev`
4. Press `t` in the Prisma terminal, then put the displayed TCP PostgreSQL URL in
   `.env` as `DATABASE_URL`.
5. In another terminal, create/apply migrations: `npm run db:migrate`
6. Seed the clearly fake demonstration shipment: `npm run db:seed`
7. Start Next.js: `npm run dev`
8. Open Prisma Studio when needed: `npm run db:studio`

Keep the Prisma Postgres process running while migrating, seeding, using Studio,
or running the application. Press `q` in its terminal when finished.

Useful checks are `npm run db:validate`, `npm run db:generate`, `npm test`,
`npm run lint`, `npm run typecheck`, and `npm run build`.
