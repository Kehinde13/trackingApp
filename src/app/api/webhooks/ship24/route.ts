import { after } from "next/server";

import { getServerEnvironment } from "@/lib/env";
import { cleanupExpiredWebhookReceipts, processShip24Webhook } from "@/lib/ship24-webhook";
import { parseShip24Webhook } from "@/lib/ship24-webhook-schema";
import { WebhookBodyError, readBoundedRawBody, verifyBearerSecret } from "@/lib/webhook-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
const json = (status: number, ok: boolean) => new Response(JSON.stringify({ ok }), { status, headers });

export function HEAD() {
  return new Response(null, { status: 200, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const secret = getServerEnvironment().ship24WebhookSecret ?? "";
  if (!verifyBearerSecret(request.headers.get("authorization"), secret)) return json(401, false);

  let rawBody: string;
  try { rawBody = await readBoundedRawBody(request); }
  catch (error: unknown) {
    return error instanceof WebhookBodyError && error.code === "BODY_TOO_LARGE" ? json(413, false) : json(400, false);
  }
  let value: unknown;
  try { value = JSON.parse(rawBody); } catch { return json(400, false); }
  const parsed = parseShip24Webhook(value);
  if (!parsed) return json(400, false);
  try { await processShip24Webhook(rawBody, parsed); }
  catch { return json(503, false); }
  after(() => cleanupExpiredWebhookReceipts().catch(() => undefined));
  return json(200, true);
}
