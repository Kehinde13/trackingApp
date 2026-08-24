import { after } from "next/server";

import { cleanupExpiredWebhookReceipts, process17TrackWebhook } from "@/lib/seventeen-track-webhook";
import { parse17TrackWebhook } from "@/lib/seventeen-track-webhook-schema";
import { WebhookBodyError, readBoundedRawBody, verifyWebhookSignature } from "@/lib/webhook-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const json = (status: number, ok: boolean) =>
  new Response(JSON.stringify({ ok }), { status, headers: responseHeaders });

export async function POST(request: Request) {
  let rawBody: string;
  try { rawBody = await readBoundedRawBody(request); }
  catch (error: unknown) {
    return error instanceof WebhookBodyError && error.code === "BODY_TOO_LARGE"
      ? json(413, false)
      : json(400, false);
  }

  const secret = process.env.TRACKING_WEBHOOK_SECRET ?? "";
  if (!verifyWebhookSignature(rawBody, request.headers.get("sign"), secret)) {
    return json(401, false);
  }

  let value: unknown;
  try { value = JSON.parse(rawBody); }
  catch { return json(400, false); }
  const parsed = parse17TrackWebhook(value);
  if (!parsed) return json(400, false);

  try {
    await process17TrackWebhook(rawBody, parsed);
  } catch {
    return json(503, false);
  }
  after(() => cleanupExpiredWebhookReceipts().catch(() => undefined));
  return json(200, true);
}
