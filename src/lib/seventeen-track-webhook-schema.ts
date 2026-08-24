import "server-only";

import { seventeenTrackTrackingItemSchema } from "@/lib/seventeen-track-provider";
import { z } from "zod";

const stoppedSchema = z.object({
  event: z.literal("TRACKING_STOPPED"),
  data: z.object({
    number: z.string().regex(/^[A-Za-z0-9-]{5,50}$/),
    carrier: z.number().int().positive(),
  }),
});

const updatedSchema = z.object({
  event: z.literal("TRACKING_UPDATED"),
  data: seventeenTrackTrackingItemSchema,
});

const envelopeSchema = z.object({
  event: z.string().min(1).max(64).regex(/^[A-Z][A-Z0-9_]*$/),
  data: z.unknown().optional(),
});

export type Parsed17TrackWebhook =
  | { kind: "updated"; payload: z.infer<typeof updatedSchema> }
  | { kind: "stopped"; payload: z.infer<typeof stoppedSchema> }
  | { kind: "unsupported" };

export function parse17TrackWebhook(value: unknown): Parsed17TrackWebhook | null {
  const envelope = envelopeSchema.safeParse(value);
  if (!envelope.success) return null;
  if (envelope.data.event === "TRACKING_UPDATED") {
    const parsed = updatedSchema.safeParse(value);
    return parsed.success ? { kind: "updated", payload: parsed.data } : null;
  }
  if (envelope.data.event === "TRACKING_STOPPED") {
    const parsed = stoppedSchema.safeParse(value);
    return parsed.success ? { kind: "stopped", payload: parsed.data } : null;
  }
  return { kind: "unsupported" };
}
