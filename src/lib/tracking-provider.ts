import "server-only";

import { createHash } from "node:crypto";

import { z } from "zod";

export const trackingRequestSchema = z.object({
  trackingNumber: z.string().trim().regex(/^[A-Za-z0-9-]{5,50}$/),
  carrierCode: z.string().trim().regex(/^\d{1,10}$/).optional(),
});

export type TrackingRequest = z.infer<typeof trackingRequestSchema>;

export type NormalizedCarrierEvent = {
  stableId?: string;
  occurredAt: Date;
  providerStatus: string;
  providerSubStatus?: string;
  description: string;
  location?: string;
  city?: string;
  countryCode?: string;
};

export type TrackingInfo = {
  carrierCode?: string;
  events: NormalizedCarrierEvent[];
};

export interface TrackingProvider {
  readonly name: string;
  readonly enabled: boolean;
  registerTracking(input: TrackingRequest): Promise<{ carrierCode?: string }>;
  getTrackingInfo(input: TrackingRequest): Promise<TrackingInfo>;
}

export const TRACKING_ERROR_CODES = {
  DISABLED: "PROVIDER_DISABLED",
  NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  INVALID_INPUT: "PROVIDER_INVALID_INPUT",
  AUTHENTICATION: "PROVIDER_AUTHENTICATION_FAILED",
  RATE_LIMITED: "PROVIDER_RATE_LIMITED",
  TIMEOUT: "PROVIDER_TIMEOUT",
  UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  INVALID_RESPONSE: "PROVIDER_INVALID_RESPONSE",
  REJECTED: "PROVIDER_REQUEST_REJECTED",
  UNKNOWN_STATUS: "PROVIDER_UNKNOWN_STATUS",
} as const;

export type TrackingErrorCode = (typeof TRACKING_ERROR_CODES)[keyof typeof TRACKING_ERROR_CODES];

export class TrackingProviderError extends Error {
  constructor(readonly code: TrackingErrorCode) {
    super(code);
    this.name = "TrackingProviderError";
  }
}

function normalized(value: string | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function carrierEventId(
  provider: string,
  trackingNumber: string,
  event: NormalizedCarrierEvent,
): string {
  if (event.stableId) {
    return `${provider}:${createHash("sha256").update(event.stableId).digest("hex")}`;
  }
  const canonical = [
    provider,
    trackingNumber,
    event.occurredAt.toISOString(),
    normalized(event.providerSubStatus ?? event.providerStatus),
    normalized(event.location),
    normalized(event.description),
  ].join("\u001f");
  return `${provider}:${createHash("sha256").update(canonical).digest("hex")}`;
}
