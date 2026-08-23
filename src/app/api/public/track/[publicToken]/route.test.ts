import { beforeEach, describe, expect, it, vi } from "vitest";

const consumePublicRateLimit = vi.fn();
const resolveRateLimitIdentity = vi.fn(() => ({ identity: "test", limit: 30 }));
const getPublicShipment = vi.fn();
vi.mock("@/lib/public-rate-limit", () => ({ consumePublicRateLimit, resolveRateLimitIdentity }));
vi.mock("@/lib/public-shipments", () => ({ getPublicShipment }));

const validToken = "AbCdEf0123456789_-AbCdEf01234567";
const call = async (token: string) => {
  const { GET } = await import("./route");
  return GET(new Request(`https://parcel.test/api/public/track/${token}`), { params: Promise.resolve({ publicToken: token }) });
};

describe("public tracking API", () => {
  beforeEach(() => { vi.clearAllMocks(); consumePublicRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 }); });
  it("uses the same generic 404 for malformed and unknown tokens", async () => {
    getPublicShipment.mockResolvedValue(null);
    const malformed = await call("bad");
    const unknown = await call(validToken);
    expect([malformed.status, unknown.status]).toEqual([404, 404]);
    expect(await malformed.json()).toEqual(await unknown.json());
  });
  it("sets privacy and no-store headers", async () => {
    getPublicShipment.mockResolvedValue({ reference: "PT-TEST" });
    const response = await call(validToken);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("returns 429 with retry timing", async () => {
    consumePublicRateLimit.mockResolvedValue({ allowed: false, retryAfter: 123 });
    const response = await call(validToken);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("123");
    expect(getPublicShipment).not.toHaveBeenCalled();
  });
  it("fails closed when client identity is unavailable", async () => {
    consumePublicRateLimit.mockResolvedValue(null);
    expect((await call(validToken)).status).toBe(503);
  });
  it("does not expose public mutation handlers", async () => {
    const route = await import("./route");
    expect(route).not.toHaveProperty("POST");
    expect(route).not.toHaveProperty("PUT");
    expect(route).not.toHaveProperty("PATCH");
    expect(route).not.toHaveProperty("DELETE");
  });
});
