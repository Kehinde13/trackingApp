import { describe, expect, it } from "vitest";

import { parseDatabasePoolMax, readServerEnvironment, validateProductionEnvironment } from "@/lib/environment-schema";

const valid = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://invented:invented@db.example.test:5432/parceltrack?sslmode=require",
  BETTER_AUTH_SECRET: "a".repeat(32),
  BETTER_AUTH_URL: "https://parcel.example.test",
  BETTER_AUTH_TRUSTED_ORIGINS: "https://parcel.example.test",
  PUBLIC_TRACKING_HMAC_SECRET: "b".repeat(32),
  DATABASE_POOL_MAX: "2",
  TRACKING_PROVIDER: "disabled",
};

describe("production environment validation", () => {
  it("accepts invented production configuration without revealing values", () => {
    expect(validateProductionEnvironment(valid)).toEqual([]);
    expect(readServerEnvironment(valid)).toMatchObject({ isProduction: true, databasePoolMax: 2, canonicalOrigin: "https://parcel.example.test", trackingProvider: "disabled" });
  });

  it("fails closed for missing security variables and insecure origins", () => {
    const errors = validateProductionEnvironment({ NODE_ENV: "production", BETTER_AUTH_URL: "http://parcel.example.test" });
    expect(errors).toEqual(expect.arrayContaining(["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "BETTER_AUTH_TRUSTED_ORIGINS", "PUBLIC_TRACKING_HMAC_SECRET"]));
    expect(() => readServerEnvironment({ NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
  });

  it("requires explicit canonical origin membership and never trusts wildcard previews", () => {
    expect(validateProductionEnvironment({ ...valid, BETTER_AUTH_TRUSTED_ORIGINS: "https://*.vercel.app" })).toContain("BETTER_AUTH_TRUSTED_ORIGINS");
  });

  it("requires both independent 17TRACK secrets when enabled", () => {
    expect(validateProductionEnvironment({ ...valid, TRACKING_PROVIDER: "17track" })).toEqual(expect.arrayContaining(["TRACKING_PROVIDER_API_KEY", "TRACKING_WEBHOOK_SECRET"]));
  });

  it("requires only the Ship24 API key when Ship24 is selected", () => {
    expect(validateProductionEnvironment({ ...valid, TRACKING_PROVIDER: "ship24" })).toContain("SHIP24_API_KEY");
    expect(validateProductionEnvironment({ ...valid, TRACKING_PROVIDER: "ship24", SHIP24_API_KEY: "invented" })).toEqual([]);
  });

  it.each([[undefined, 2], ["1", 1], ["10", 10], ["0", null], ["11", null], ["2.5", null], ["no", null]])("parses bounded pool size %s", (value, expected) => {
    expect(parseDatabasePoolMax(value)).toBe(expected);
  });

  it("supports local HTTP only for loopback development", () => {
    expect(readServerEnvironment({ NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" }).canonicalOrigin).toBe("http://localhost:3000");
    expect(readServerEnvironment({ NODE_ENV: "development", BETTER_AUTH_URL: "http://untrusted.test" }).canonicalOrigin).toBe("http://localhost:3000");
  });
});
