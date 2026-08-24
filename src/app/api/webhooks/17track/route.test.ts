import { beforeEach, describe, expect, it, vi } from "vitest";

import { createWebhookSignature } from "@/lib/webhook-security";

const { process17TrackWebhook, cleanupExpiredWebhookReceipts, parse17TrackWebhook } = vi.hoisted(() => ({
  process17TrackWebhook: vi.fn(),
  cleanupExpiredWebhookReceipts: vi.fn(),
  parse17TrackWebhook: vi.fn((value: { event?: string }) => value.event === "FUTURE_EVENT"
    ? { kind: "unsupported" }
    : { kind: "stopped", payload: value }),
}));
vi.mock("@/lib/seventeen-track-webhook", () => ({ process17TrackWebhook, cleanupExpiredWebhookReceipts }));
vi.mock("@/lib/seventeen-track-webhook-schema", () => ({ parse17TrackWebhook }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const secret = "invented-route-test-key";
const validBody = JSON.stringify({ event: "TRACKING_STOPPED", data: { number: "TEST-12345", carrier: 3011 } });
const request = (body: string, signature = createWebhookSignature(body, secret)) => new Request("http://local.test/api/webhooks/17track", { method: "POST", headers: { sign: signature }, body });

describe("POST /api/webhooks/17track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TRACKING_WEBHOOK_SECRET = secret;
    process17TrackWebhook.mockResolvedValue({ duplicate: false });
  });

  it("verifies the signature before parsing JSON", async () => {
    const { POST } = await import("./route");
    const response = await POST(request("not json", "0".repeat(64)));
    expect(response.status).toBe(401);
    expect(process17TrackWebhook).not.toHaveBeenCalled();
  });

  it("rejects authenticated malformed JSON and missing configuration", async () => {
    const { POST } = await import("./route");
    expect((await POST(request("not json"))).status).toBe(400);
    delete process.env.TRACKING_WEBHOOK_SECRET;
    expect((await POST(request(validBody))).status).toBe(401);
  });

  it("returns only a generic acknowledgement for valid and unsupported events", async () => {
    const { POST } = await import("./route");
    for (const body of [validBody, JSON.stringify({ event: "FUTURE_EVENT", data: { private: "discard" } })]) {
      const response = await POST(request(body));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    }
  });

  it("returns 503 when the durable transaction fails", async () => {
    process17TrackWebhook.mockRejectedValueOnce(new Error("database unavailable"));
    const { POST } = await import("./route");
    const response = await POST(request(validBody));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });
});
