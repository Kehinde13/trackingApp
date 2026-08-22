import "server-only";

import { randomBytes } from "node:crypto";

const PUBLIC_TOKEN_BYTES = 24;

/**
 * Generates the bearer token that grants access to a shipment's public page.
 * Treat the returned value as sensitive even though it is URL-safe.
 */
export function generatePublicTrackingToken(): string {
  return randomBytes(PUBLIC_TOKEN_BYTES).toString("base64url");
}
