import "server-only";

import { z } from "zod";

import {
  TRACKING_ERROR_CODES,
  TrackingProviderError,
  trackingRequestSchema,
  type NormalizedCarrierEvent,
  type TrackingInfo,
  type TrackingProvider,
  type TrackingRequest,
} from "@/lib/tracking-provider";

const API_ORIGIN = "https://api.ship24.com/public/v1";
const MAX_RESPONSE_BYTES = 1_048_576;
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MIN_REQUEST_INTERVAL_MS = 100;

let requestGate = Promise.resolve();
let nextRequestAt = 0;

const nullableString = z.string().nullable().optional();
const trackerSchema = z.object({
  trackerId: z.string().min(1).max(100),
  trackingNumber: z.string().min(1).max(50),
  clientTrackerId: nullableString,
  courierCode: z.union([z.string(), z.array(z.string())]).optional(),
});
const eventSchema = z.object({
  eventId: z.string().min(1).max(200),
  status: nullableString,
  occurrenceDatetime: z.string().min(10).max(40),
  order: z.number().int().nullable().optional(),
  location: nullableString,
  courierCode: nullableString,
  statusCode: nullableString,
  statusMilestone: z.string().min(1).max(100),
});
const metadataSchema = z.object({
  generatedAt: z.string().min(10).max(40),
});
const shipmentSchema = z.object({
  statusCode: nullableString,
  statusMilestone: z.string().min(1).max(100),
});
const trackingSchema = z.object({
  metadata: metadataSchema.optional(),
  tracker: trackerSchema,
  shipment: shipmentSchema.optional(),
  events: z.array(eventSchema).max(10_000),
});
const registerResponseSchema = z.object({ data: z.object({ tracker: trackerSchema }) });
const resultsResponseSchema = z.object({ data: z.object({ trackings: z.array(trackingSchema).max(1) }) });

export type Ship24Tracking = z.infer<typeof trackingSchema>;

async function respectRateLimit(pause: (milliseconds: number) => Promise<void>) {
  const turn = requestGate.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await pause(delay);
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
  });
  requestGate = turn.catch(() => undefined);
  await turn;
}

function safeText(value: string | null | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

function safeCourierCode(value: string | null | undefined): string | undefined {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value ?? "") ? value! : undefined;
}

function validWallClock(parts: number[]): boolean {
  const [year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0] = parts;
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day && probe.getUTCHours() === hour &&
    probe.getUTCMinutes() === minute && probe.getUTCSeconds() === second &&
    probe.getUTCMilliseconds() === millisecond;
}

export type ParsedShip24Timestamp = { occurredAt: Date | null; providerOccurredAt: string };

export function parseShip24Timestamp(value: string): ParsedShip24Timestamp | null {
  const source = value.trim();
  const knownInstant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(source);
  if (knownInstant) {
    const occurredAt = new Date(source);
    return Number.isNaN(occurredAt.getTime()) ? null : { occurredAt, providerOccurredAt: source };
  }

  const local = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?)?$/.exec(source);
  if (!local) return null;
  const parts = local.slice(1, 7).map((part) => Number(part ?? 0));
  const milliseconds = Number((local[7] ?? "").padEnd(3, "0") || 0);
  if (!validWallClock([...parts, milliseconds])) return null;
  return { occurredAt: null, providerOccurredAt: source };
}

function parseGeneratedAt(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeShip24Tracking(tracking: Ship24Tracking): TrackingInfo {
  const events: NormalizedCarrierEvent[] = [];
  for (const event of tracking.events) {
    const timestamp = parseShip24Timestamp(event.occurrenceDatetime);
    const description = safeText(event.status, 500) ?? event.statusMilestone.replaceAll("_", " ");
    if (!timestamp || !description) continue;
    events.push({
      stableId: event.eventId,
      ...timestamp,
      providerEventOrder: event.order ?? undefined,
      providerStatus: event.statusMilestone,
      providerSubStatus: safeText(event.statusCode, 100),
      description,
      location: safeText(event.location, 160),
    });
  }
  const codes = Array.isArray(tracking.tracker.courierCode)
    ? tracking.tracker.courierCode
    : [tracking.tracker.courierCode];
  const observedAt = parseGeneratedAt(tracking.metadata?.generatedAt);
  const currentStatus = tracking.shipment && observedAt
    ? {
        providerStatus: tracking.shipment.statusMilestone,
        ...(tracking.shipment.statusCode ? { providerSubStatus: tracking.shipment.statusCode } : {}),
        observedAt,
      }
    : undefined;
  return {
    carrierCode: codes.map((value) => safeCourierCode(value)).find(Boolean),
    ...(currentStatus ? { currentStatus } : {}),
    events,
  };
}

function registrationBody(input: TrackingRequest) {
  const parsed = trackingRequestSchema.safeParse(input);
  if (!parsed.success || !parsed.data.clientTrackerId) {
    throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_INPUT);
  }
  return {
    trackingNumber: parsed.data.trackingNumber,
    clientTrackerId: parsed.data.clientTrackerId,
    ...(parsed.data.carrierCode ? { courierCode: parsed.data.carrierCode } : {}),
    ...(parsed.data.originCountryCode ? { originCountryCode: parsed.data.originCountryCode } : {}),
    ...(parsed.data.destinationCountryCode ? { destinationCountryCode: parsed.data.destinationCountryCode } : {}),
  };
}

async function readBounded(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_RESPONSE_BYTES || !response.body) throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_RESPONSE);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_RESPONSE);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_RESPONSE); }
}

function httpError(status: number): TrackingProviderError {
  if (status === 401 || status === 403) return new TrackingProviderError(TRACKING_ERROR_CODES.AUTHENTICATION);
  if (status === 429) return new TrackingProviderError(TRACKING_ERROR_CODES.RATE_LIMITED);
  if (status >= 500) return new TrackingProviderError(TRACKING_ERROR_CODES.UNAVAILABLE);
  return new TrackingProviderError(TRACKING_ERROR_CODES.REJECTED);
}

function retryable(status: number): boolean {
  return status === 409 || status === 429 || [500, 502, 503, 504].includes(status);
}

export class Ship24Provider implements TrackingProvider {
  readonly name = "ship24";
  readonly enabled = true;

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly pause: (milliseconds: number) => Promise<void> =
      (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    private readonly timeoutMs = TIMEOUT_MS,
  ) {
    if (!apiKey) throw new TrackingProviderError(TRACKING_ERROR_CODES.NOT_CONFIGURED);
  }

  private async request(path: string, init: { method: "GET" | "POST"; body?: string }) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        await respectRateLimit(this.pause);
        const response = await this.fetcher(`${API_ORIGIN}${path}`, {
          ...init,
          redirect: "error",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(init.body ? { "content-type": "application/json" } : {}),
          },
        });
        if (!response.ok) {
          if (retryable(response.status) && attempt < MAX_ATTEMPTS - 1) {
            await response.body?.cancel();
            await this.pause(Math.min(1_000, 250 * 2 ** attempt));
            continue;
          }
          throw httpError(response.status);
        }
        return readBounded(response);
      } catch (error: unknown) {
        if (error instanceof TrackingProviderError) throw error;
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new TrackingProviderError(TRACKING_ERROR_CODES.TIMEOUT);
        }
        throw new TrackingProviderError(TRACKING_ERROR_CODES.UNAVAILABLE);
      } finally { clearTimeout(timer); }
    }
    throw new TrackingProviderError(TRACKING_ERROR_CODES.UNAVAILABLE);
  }

  async registerTracking(input: TrackingRequest) {
    const parsed = registerResponseSchema.safeParse(await this.request("/trackers", {
      method: "POST",
      body: JSON.stringify(registrationBody(input)),
    }));
    if (!parsed.success || parsed.data.data.tracker.clientTrackerId !== input.clientTrackerId) {
      throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_RESPONSE);
    }
    const codes = parsed.data.data.tracker.courierCode;
    const carrierCode = (Array.isArray(codes) ? codes : [codes]).map((value) => safeCourierCode(value)).find(Boolean);
    return { providerTrackerId: parsed.data.data.tracker.trackerId, carrierCode };
  }

  async getTrackingInfo(input: TrackingRequest) {
    if (!input.providerTrackerId) throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_INPUT);
    const parsed = resultsResponseSchema.safeParse(await this.request(
      `/trackers/${encodeURIComponent(input.providerTrackerId)}/results`,
      { method: "GET" },
    ));
    const tracking = parsed.success ? parsed.data.data.trackings[0] : undefined;
    if (!tracking || tracking.tracker.trackerId !== input.providerTrackerId) {
      throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_RESPONSE);
    }
    return normalizeShip24Tracking(tracking);
  }
}

export { eventSchema as ship24EventSchema, trackerSchema as ship24TrackerSchema, trackingSchema as ship24TrackingSchema };
