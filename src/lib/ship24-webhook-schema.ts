import { z } from "zod";

import { ship24TrackingSchema } from "@/lib/ship24-provider";

const ship24WebhookSchema = z.object({
  trackings: z.array(ship24TrackingSchema).min(1).max(100),
});

export type ParsedShip24Webhook = z.infer<typeof ship24WebhookSchema>;

export function parseShip24Webhook(value: unknown): ParsedShip24Webhook | null {
  const parsed = ship24WebhookSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
