import { describe, expect, it, vi } from "vitest";

import {
  MAX_WEBHOOK_BODY_BYTES,
  WebhookBodyError,
  createWebhookSignature,
  readBoundedRawBody,
  verifyWebhookSignature,
  webhookPayloadHash,
} from "@/lib/webhook-security";

const secret = "invented-webhook-test-key";
const body = '{"event":"TRACKING_STOPPED","data":{"number":"TEST-12345","carrier":3011}}';

describe("17TRACK webhook security", () => {
  it("verifies the exact raw UTF-8 body and rejects whitespace changes", () => {
    const signature = createWebhookSignature(body, secret);
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(`${body}\n`, signature, secret)).toBe(false);
  });

  it("rejects missing secret, missing signature, and malformed hexadecimal", () => {
    expect(verifyWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "not-hex", secret)).toBe(false);
    expect(verifyWebhookSignature(body, createWebhookSignature(body, secret), "")).toBe(false);
  });

  it("uses the constant-time comparison path for valid signature shapes", () => {
    const compare = vi.fn(() => true);
    expect(verifyWebhookSignature(body, "a".repeat(64), secret, compare)).toBe(true);
    expect(compare).toHaveBeenCalledOnce();
    expect(compare).toHaveBeenCalledWith(
      expect.objectContaining({ byteLength: 32 }),
      expect.objectContaining({ byteLength: 32 }),
    );
  });

  it("reads the exact body and rejects missing or invalid UTF-8 bodies", async () => {
    await expect(readBoundedRawBody(new Request("http://local.test", { method: "POST", body }))).resolves.toBe(body);
    await expect(readBoundedRawBody(new Request("http://local.test", { method: "POST" }))).rejects.toMatchObject({ code: "MISSING_BODY" });
    const invalid = new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.from([0xc3, 0x28])); controller.close(); } });
    await expect(readBoundedRawBody(new Request("http://local.test", { method: "POST", body: invalid, duplex: "half" } as RequestInit))).rejects.toMatchObject({ code: "INVALID_UTF8" });
  });

  it("rejects honest and dishonest oversized bodies", async () => {
    const honest = new Request("http://local.test", { method: "POST", headers: { "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1) }, body: "x" });
    await expect(readBoundedRawBody(honest)).rejects.toBeInstanceOf(WebhookBodyError);
    const chunk = new Uint8Array(MAX_WEBHOOK_BODY_BYTES + 1);
    const stream = new ReadableStream({ start(controller) { controller.enqueue(chunk); controller.close(); } });
    const dishonest = new Request("http://local.test", { method: "POST", headers: { "content-length": "1" }, body: stream, duplex: "half" } as RequestInit);
    await expect(readBoundedRawBody(dishonest)).rejects.toMatchObject({ code: "BODY_TOO_LARGE" });
  });

  it("hashes authenticated payloads without the secret or tracking value", () => {
    const hash = webhookPayloadHash(body);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(secret);
    expect(hash).not.toContain("TEST-12345");
  });
});
