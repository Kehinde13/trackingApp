import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

export const MAX_WEBHOOK_BODY_BYTES = 512 * 1024;

export class WebhookBodyError extends Error {
  constructor(readonly code: "MISSING_BODY" | "INVALID_UTF8" | "BODY_TOO_LARGE") {
    super(code);
    this.name = "WebhookBodyError";
  }
}

export async function readBoundedRawBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declared = Number(contentLength);
    if (!Number.isSafeInteger(declared) || declared < 0 || declared > MAX_WEBHOOK_BODY_BYTES) {
      throw new WebhookBodyError("BODY_TOO_LARGE");
    }
  }
  if (!request.body) throw new WebhookBodyError("MISSING_BODY");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_WEBHOOK_BODY_BYTES) {
      await reader.cancel();
      throw new WebhookBodyError("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  if (length === 0) throw new WebhookBodyError("MISSING_BODY");
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new WebhookBodyError("INVALID_UTF8"); }
}

export function createWebhookSignature(rawBody: string, secret: string): string {
  return createHash("sha256").update(`${rawBody}/${secret}`, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  rawBody: string,
  suppliedSignature: string | null,
  secret: string,
  compare: typeof timingSafeEqual = timingSafeEqual,
): boolean {
  if (!secret || !suppliedSignature || !/^[a-f0-9]{64}$/.test(suppliedSignature)) return false;
  const supplied = Buffer.from(suppliedSignature, "hex");
  const expected = Buffer.from(createWebhookSignature(rawBody, secret), "hex");
  return compare(supplied, expected);
}

export function webhookPayloadHash(rawBody: string): string {
  return createHash("sha256").update("parceltrack:17track:webhook:v1\0").update(rawBody, "utf8").digest("hex");
}
