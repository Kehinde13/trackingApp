import "server-only";

import { createHmac } from "node:crypto";
import { ipAddress } from "@vercel/functions";
import { prisma } from "@/lib/prisma";

export const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const PUBLIC_RATE_LIMIT = 30;
export const ANONYMOUS_PRODUCTION_LIMIT = 5;
const LABEL = "parceltrack:public-tracking-rate-limit:v1\0";

export type RateLimitIdentity = { identity: string; limit: number } | { unavailable: true };

export function resolveRateLimitIdentity(request: Request, env = process.env, resolveIp: (request: Request) => string | undefined = ipAddress): RateLimitIdentity {
  if (env.NODE_ENV !== "production") return { identity: "shared-local-development", limit: PUBLIC_RATE_LIMIT };
  if (env.VERCEL !== "1") return { unavailable: true };
  const ip = resolveIp(request);
  return ip ? { identity: `vercel-ip:${ip}`, limit: PUBLIC_RATE_LIMIT } : { identity: "shared-anonymous-production", limit: ANONYMOUS_PRODUCTION_LIMIT };
}

export function hashRateLimitIdentity(identity: string, secret: string): string {
  return createHmac("sha256", secret).update(`${LABEL}${identity}`).digest("hex");
}

export type RateLimitResult = { allowed: boolean; retryAfter: number };

export async function consumePublicRateLimit(identity: RateLimitIdentity, now = new Date()): Promise<RateLimitResult | null> {
  if ("unavailable" in identity) return null;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;
  const identityHash = hashRateLimitIdentity(identity.identity, secret);
  const expiresAt = new Date(now.getTime() + RATE_LIMIT_WINDOW_MS);
  await prisma.publicTrackingRateLimit.deleteMany({ where: { expiresAt: { lt: now }, identityHash: { not: identityHash } } });
  const rows = await prisma.$queryRaw<Array<{ requestCount: number; expiresAt: Date }>>`
    INSERT INTO "PublicTrackingRateLimit" ("identityHash", "requestCount", "windowStart", "expiresAt", "updatedAt")
    VALUES (${identityHash}, 1, ${now}, ${expiresAt}, ${now})
    ON CONFLICT ("identityHash") DO UPDATE SET
      "requestCount" = CASE WHEN "PublicTrackingRateLimit"."expiresAt" <= ${now} THEN 1 ELSE "PublicTrackingRateLimit"."requestCount" + 1 END,
      "windowStart" = CASE WHEN "PublicTrackingRateLimit"."expiresAt" <= ${now} THEN ${now} ELSE "PublicTrackingRateLimit"."windowStart" END,
      "expiresAt" = CASE WHEN "PublicTrackingRateLimit"."expiresAt" <= ${now} THEN ${expiresAt} ELSE "PublicTrackingRateLimit"."expiresAt" END,
      "updatedAt" = ${now}
    RETURNING "requestCount", "expiresAt"
  `;
  const current = rows[0];
  if (!current) return null;
  return current.requestCount <= identity.limit
    ? { allowed: true, retryAfter: 0 }
    : { allowed: false, retryAfter: Math.max(1, Math.ceil((current.expiresAt.getTime() - now.getTime()) / 1000)) };
}
