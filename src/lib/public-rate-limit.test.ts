import "dotenv/config";
import { describe, expect, it } from "vitest";
import { ANONYMOUS_PRODUCTION_LIMIT, hashRateLimitIdentity, PUBLIC_RATE_LIMIT, resolveRateLimitIdentity } from "./public-rate-limit";

const request = new Request("https://parcel.test/api/public/track/token", { headers: { "x-forwarded-for": "203.0.113.250" } });
describe("public rate-limit identity", () => {
  it("uses the official resolver on Vercel", () => expect(resolveRateLimitIdentity(request, { NODE_ENV: "production", VERCEL: "1" }, () => "198.51.100.10")).toEqual({ identity: "vercel-ip:198.51.100.10", limit: PUBLIC_RATE_LIMIT }));
  it("uses a shared local identity and ignores forged forwarded headers", () => expect(resolveRateLimitIdentity(request, { NODE_ENV: "development" }, () => "203.0.113.250")).toEqual({ identity: "shared-local-development", limit: PUBLIC_RATE_LIMIT }));
  it("uses a strongly limited shared bucket when Vercel has no IP", () => expect(resolveRateLimitIdentity(request, { NODE_ENV: "production", VERCEL: "1" }, () => undefined)).toEqual({ identity: "shared-anonymous-production", limit: ANONYMOUS_PRODUCTION_LIMIT }));
  it("fails closed outside Vercel production", () => expect(resolveRateLimitIdentity(request, { NODE_ENV: "production" }, () => "198.51.100.10")).toEqual({ unavailable: true }));
  it("stores only a keyed hash, never the raw IP", () => { const hash = hashRateLimitIdentity("vercel-ip:198.51.100.10", "high-entropy-test-secret"); expect(hash).toMatch(/^[a-f0-9]{64}$/); expect(hash).not.toContain("198.51.100.10"); });
});
