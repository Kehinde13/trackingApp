import { describe, expect, it, vi } from "vitest";
import { verifyBearerSecret } from "@/lib/webhook-security";

describe("webhook bearer authentication", () => {
  it("accepts exact secrets and uses constant-time comparison", () => {
    const compare = vi.fn(() => true);
    expect(verifyBearerSecret("Bearer invented-secret", "invented-secret", compare)).toBe(true);
    expect(compare).toHaveBeenCalledOnce();
  });
  it("rejects missing and different-length secrets generically while still comparing", () => {
    const compare = vi.fn(() => false);
    expect(verifyBearerSecret("Bearer short", "invented-secret", compare)).toBe(false);
    expect(compare).toHaveBeenCalledOnce();
    expect(verifyBearerSecret(null, "invented-secret", compare)).toBe(false);
  });
});
