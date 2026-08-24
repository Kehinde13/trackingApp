import "server-only";

import { z } from "zod";

import {
  TRACKING_ERROR_CODES,
  TrackingProviderError,
  trackingRequestSchema,
  type NormalizedCarrierEvent,
  type TrackingProvider,
  type TrackingRequest,
} from "@/lib/tracking-provider";

const API_ORIGIN = "https://api.17track.net";
const MAX_RESPONSE_BYTES = 1_048_576;
const TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;
const MIN_REQUEST_INTERVAL_MS = 334;

let requestGate = Promise.resolve();
let nextRequestAt = 0;

async function respectRateLimit(pause: (milliseconds: number) => Promise<void>) {
  const turn = requestGate.then(async () => {
    const delay = Math.max(0, nextRequestAt - Date.now());
    if (delay) await pause(delay);
    nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
  });
  requestGate = turn.catch(() => undefined);
  await turn;
}

const requestItemSchema = z.object({
  number: z.string().regex(/^[A-Za-z0-9-]{5,50}$/),
  carrier: z.number().int().positive().optional(),
});

const providerErrorSchema = z.object({ code: z.number().int(), message: z.string() });
const rejectedSchema = z.object({
  number: z.string(), carrier: z.number().optional(), error: providerErrorSchema,
});
const registerResponseSchema = z.object({
  code: z.number().int(),
  data: z.object({
    accepted: z.array(z.object({ number: z.string(), carrier: z.number().int().positive() })),
    rejected: z.array(rejectedSchema),
  }),
});

const nullableString = z.string().nullable().optional();
const eventSchema = z.object({
  time_iso: nullableString,
  time_utc: nullableString,
  description: nullableString,
  location: nullableString,
  stage: nullableString,
  sub_status: nullableString,
  address: z.object({ country: nullableString, city: nullableString }).nullable().optional(),
});
const trackingResponseSchema = z.object({
  code: z.number().int(),
  data: z.object({
    accepted: z.array(z.object({
      number: z.string(),
      carrier: z.number().int().positive(),
      track_info: z.object({
        tracking: z.object({
          providers: z.array(z.object({ events: z.array(eventSchema) })),
        }),
      }).nullable(),
    })),
    rejected: z.array(rejectedSchema),
  }),
});

function safeText(value: string | null | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : undefined;
}

function safeProviderCode(value: string | null | undefined): string {
  return /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(value ?? "") ? value! : "Unknown";
}

function requestBody(input: TrackingRequest) {
  const parsed = trackingRequestSchema.safeParse(input);
  if (!parsed.success) throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_INPUT);
  return [requestItemSchema.parse({
    number: parsed.data.trackingNumber,
    carrier: parsed.data.carrierCode ? Number(parsed.data.carrierCode) : undefined,
  })];
}

async function readBounded(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_RESPONSE_BYTES) throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_RESPONSE);
  if (!response.body) throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_RESPONSE);
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

export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

export class SeventeenTrackProvider implements TrackingProvider {
  readonly name = "17track";
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

  private async post(path: "/track/v2.4/register" | "/track/v2.4/gettrackinfo", body: unknown) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        await respectRateLimit(this.pause);
        const response = await this.fetcher(`${API_ORIGIN}${path}`, {
          method: "POST", redirect: "error", signal: controller.signal,
          headers: { "content-type": "application/json", "17token": this.apiKey },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS - 1) {
            await response.body?.cancel();
            await this.pause(Math.min(1_000, 350 * 2 ** attempt));
            continue;
          }
          throw httpError(response.status);
        }
        return await readBounded(response);
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
    const parsed = registerResponseSchema.safeParse(
      await this.post("/track/v2.4/register", requestBody(input)),
    );
    if (!parsed.success || parsed.data.code !== 0) {
      throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_RESPONSE);
    }
    const accepted = parsed.data.data.accepted.find((item) => item.number === input.trackingNumber);
    if (accepted) return { carrierCode: String(accepted.carrier) };
    const rejected = parsed.data.data.rejected.find((item) => item.number === input.trackingNumber);
    if (rejected?.error.code === -18019901) return { carrierCode: rejected.carrier ? String(rejected.carrier) : input.carrierCode };
    throw new TrackingProviderError(TRACKING_ERROR_CODES.REJECTED);
  }

  async getTrackingInfo(input: TrackingRequest) {
    const parsed = trackingResponseSchema.safeParse(
      await this.post("/track/v2.4/gettrackinfo", requestBody(input)),
    );
    if (!parsed.success || parsed.data.code !== 0) {
      throw new TrackingProviderError(TRACKING_ERROR_CODES.INVALID_RESPONSE);
    }
    const accepted = parsed.data.data.accepted.find((item) => item.number === input.trackingNumber);
    if (!accepted) throw new TrackingProviderError(TRACKING_ERROR_CODES.REJECTED);
    const events: NormalizedCarrierEvent[] = [];
    for (const provider of accepted.track_info?.tracking.providers ?? []) {
      for (const event of provider.events) {
        const timestamp = event.time_utc ?? event.time_iso;
        const occurredAt = timestamp ? new Date(timestamp) : null;
        const description = safeText(event.description, 500);
        if (!occurredAt || Number.isNaN(occurredAt.getTime()) || !description) continue;
        events.push({
          occurredAt,
          providerStatus: safeProviderCode(event.stage),
          providerSubStatus: safeProviderCode(event.sub_status),
          description,
          location: safeText(event.location, 160),
          city: safeText(event.address?.city, 100),
          countryCode: /^[A-Za-z]{2}$/.test(event.address?.country ?? "") ? event.address!.country!.toUpperCase() : undefined,
        });
      }
    }
    return { carrierCode: String(accepted.carrier), events };
  }
}
