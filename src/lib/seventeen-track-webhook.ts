import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { CarrierConnectionStatus, ProviderWebhookOutcome } from "@/generated/prisma/enums";
import { importCarrierTrackingInfo } from "@/lib/carrier-tracking";
import { prisma } from "@/lib/prisma";
import { normalize17TrackTrackingItem } from "@/lib/seventeen-track-provider";
import type { Parsed17TrackWebhook } from "@/lib/seventeen-track-webhook-schema";
import { webhookPayloadHash } from "@/lib/webhook-security";

export type WebhookProcessResult = { duplicate: boolean; outcome?: ProviderWebhookOutcome };

export async function process17TrackWebhook(
  rawBody: string,
  parsed: Parsed17TrackWebhook,
  database: typeof prisma = prisma,
): Promise<WebhookProcessResult> {
  const payloadHash = webhookPayloadHash(rawBody);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const outcome = await database.$transaction(async (tx) => {
        const processedAt = new Date();
        let receiptOutcome: ProviderWebhookOutcome = ProviderWebhookOutcome.UNSUPPORTED;

        if (parsed.kind === "updated") {
          const data = parsed.payload.data;
          const shipment = await tx.shipment.findFirst({
            where: {
              trackingProvider: "17track",
              trackingNumber: data.number,
              providerCarrierCode: String(data.carrier),
            },
            select: { id: true, trackingNumber: true, providerCarrierCode: true },
          });
          if (shipment?.trackingNumber) {
            await importCarrierTrackingInfo(
              tx,
              { id: shipment.id, trackingNumber: shipment.trackingNumber, providerCarrierCode: shipment.providerCarrierCode },
              "17track",
              normalize17TrackTrackingItem(data),
              processedAt,
              "webhook",
            );
            receiptOutcome = ProviderWebhookOutcome.PROCESSED;
          } else receiptOutcome = ProviderWebhookOutcome.UNMATCHED;
        } else if (parsed.kind === "stopped") {
          const data = parsed.payload.data;
          const updated = await tx.shipment.updateMany({
            where: {
              trackingProvider: "17track",
              trackingNumber: data.number,
              providerCarrierCode: String(data.carrier),
            },
            data: {
              carrierConnectionStatus: CarrierConnectionStatus.STOPPED,
              carrierLastSuccessfulSyncAt: processedAt,
              carrierLastErrorCode: null,
              carrierLastErrorAt: null,
            },
          });
          receiptOutcome = updated.count ? ProviderWebhookOutcome.STOPPED : ProviderWebhookOutcome.UNMATCHED;
        }

        await tx.providerWebhookReceipt.create({
          data: {
            provider: "17track",
            payloadHash,
            eventType: parsed.kind === "updated" ? "TRACKING_UPDATED" : parsed.kind === "stopped" ? "TRACKING_STOPPED" : "UNSUPPORTED",
            outcome: receiptOutcome,
            processedAt,
          },
        });
        return receiptOutcome;
      });
      return { duplicate: false, outcome };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") return { duplicate: true };
        if (
          (error.code === "P2034" ||
            (error.code === "P2010" && error.message.includes("25001"))) &&
          attempt < 2
        ) continue;
      }
      throw error;
    }
  }
  throw new Error("Webhook transaction retry limit reached");
}

export async function cleanupExpiredWebhookReceipts(database: typeof prisma = prisma) {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return database.providerWebhookReceipt.deleteMany({ where: { receivedAt: { lt: cutoff } } });
}
