import { beforeEach, describe, expect, it, vi } from "vitest";

const { processShip24Webhook, cleanupExpiredWebhookReceipts } = vi.hoisted(() => ({ processShip24Webhook: vi.fn(), cleanupExpiredWebhookReceipts: vi.fn() }));
vi.mock("@/lib/ship24-webhook", () => ({ processShip24Webhook, cleanupExpiredWebhookReceipts }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const secret = "invented-independent-webhook-secret";
const valid = JSON.stringify({ trackings: [{ tracker: { trackerId: "trk_1", trackingNumber: "FAKE123456", clientTrackerId: "parceltrack:00000000-0000-4000-8000-000000000001" }, events: [] }] });
const request = (body: string, authorization = `Bearer ${secret}`) => new Request("http://local.test/api/webhooks/ship24", { method: "POST", headers: { authorization }, body });

describe("POST /api/webhooks/ship24", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.SHIP24_WEBHOOK_SECRET = secret; processShip24Webhook.mockResolvedValue({ duplicate: false }); });
  it("authenticates before parsing and rejects invalid bearer credentials", async () => {
    const { POST } = await import("./route");
    expect((await POST(request("not json", "Bearer wrong"))).status).toBe(401);
    expect((await POST(new Request("http://local.test", { method: "POST", body: valid }))).status).toBe(401);
    expect(processShip24Webhook).not.toHaveBeenCalled();
  });
  it("rejects malformed and oversized bodies", async () => {
    const { POST } = await import("./route");
    expect((await POST(request("not json"))).status).toBe(400);
    expect((await POST(request("x".repeat(512 * 1024 + 1)))).status).toBe(413);
  });
  it("acknowledges valid grouped delivery generically", async () => {
    const { POST } = await import("./route");
    const result = await POST(request(valid));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(processShip24Webhook).toHaveBeenCalledOnce();
  });
});
