import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ProviderWebhookOutcome } from "@/generated/prisma/enums";
import { importCarrierTrackingInfo } from "@/lib/carrier-tracking";
import { prisma } from "@/lib/prisma";
import { normalizeShip24Tracking } from "@/lib/ship24-provider";
import type { ParsedShip24Webhook } from "@/lib/ship24-webhook-schema";
import { cleanupExpiredWebhookReceipts } from "@/lib/seventeen-track-webhook";
import { webhookPayloadHash } from "@/lib/webhook-security";

function shipmentIdFromClientTrackerId(value: string | null | undefined): string | null {
  const match = /^parceltrack:([0-9a-f-]{36})$/i.exec(value ?? "");
  return match?.[1] ?? null;
}

export async function processShip24Webhook(
  rawBody: string,
  parsed: ParsedShip24Webhook,
  database: typeof prisma = prisma,
) {
  const payloadHash = webhookPayloadHash(rawBody, "ship24");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const outcome = await database.$transaction(async (tx) => {
        const processedAt = new Date();
        let matched = 0;
        for (const tracking of parsed.trackings) {
          const clientShipmentId = shipmentIdFromClientTrackerId(tracking.tracker.clientTrackerId);
          const shipment = await tx.shipment.findFirst({
            where: {
              trackingProvider: "ship24",
              OR: [
                { providerTrackerId: tracking.tracker.trackerId },
                ...(clientShipmentId ? [{ id: clientShipmentId }] : []),
              ],
            },
            select: { id: true, trackingNumber: true, providerCarrierCode: true, status: true },
          });
          if (!shipment?.trackingNumber) continue;
          await importCarrierTrackingInfo(tx, { ...shipment, trackingNumber: shipment.trackingNumber }, "ship24", normalizeShip24Tracking(tracking), processedAt);
          matched += 1;
        }
        const receiptOutcome = matched ? ProviderWebhookOutcome.PROCESSED : ProviderWebhookOutcome.UNMATCHED;
        await tx.providerWebhookReceipt.create({
          data: { provider: "ship24", payloadHash, eventType: "TRACKINGS", outcome: receiptOutcome, processedAt },
        });
        return receiptOutcome;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { duplicate: false, outcome };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") return { duplicate: true };
        if (error.code === "P2034" && attempt < 2) continue;
      }
      throw error;
    }
  }
  throw new Error("Webhook transaction retry limit reached");
}

export { cleanupExpiredWebhookReceipts };
