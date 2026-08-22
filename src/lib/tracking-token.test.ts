import { describe, expect, it } from "vitest";

import { generatePublicTrackingToken } from "./tracking-token";

describe("generatePublicTrackingToken", () => {
  it("returns a URL-safe token backed by at least 24 random bytes", () => {
    const token = generatePublicTrackingToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(24);
  });

  it("does not produce duplicates across 100 generated tokens", () => {
    const tokens = Array.from({ length: 100 }, generatePublicTrackingToken);

    expect(new Set(tokens)).toHaveLength(tokens.length);
  });

  it("does not return predictable sequential identifiers", () => {
    const first = generatePublicTrackingToken();
    const second = generatePublicTrackingToken();

    expect(first).not.toMatch(/^\d+$/);
    expect(second).not.toBe(first);
    expect(second).not.toBe(`${first}1`);
  });
});
