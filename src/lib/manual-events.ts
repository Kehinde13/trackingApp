import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import type { ManualEventInput } from "@/lib/manual-event-validation";
import { prisma } from "@/lib/prisma";

export class ShipmentNotFoundError extends Error {
  constructor() {
    super("Package not found");
    this.name = "ShipmentNotFoundError";
  }
}

export function shouldUpdateShipmentStatus(
  occurredAt: Date,
  newestOccurredAt: Date | null,
): boolean {
  return newestOccurredAt === null || occurredAt.getTime() >= newestOccurredAt.getTime();
}

export function getNewestStatusUpdate(
  input: ManualEventInput,
  newestOccurredAt: Date | null,
): { status: ShipmentStatus; deliveredAt?: Date } | null {
  if (!shouldUpdateShipmentStatus(input.occurredAt, newestOccurredAt)) return null;
  return input.status === ShipmentStatus.DELIVERED
    ? { status: input.status, deliveredAt: input.occurredAt }
    : { status: input.status };
}

export async function addManualTrackingEvent(
  shipmentId: string,
  actorId: string,
  input: ManualEventInput,
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const shipment = await transaction.shipment.findUnique({
            where: { id: shipmentId },
            select: { id: true },
          });
          if (!shipment) throw new ShipmentNotFoundError();

          const newestEvent = await transaction.trackingEvent.findFirst({
            where: { shipmentId, occurredAt: { not: null }, statusAffectsShipment: true },
            orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
            select: { occurredAt: true },
          });
          const shipmentUpdate = getNewestStatusUpdate(
            input,
            newestEvent?.occurredAt ?? null,
          );

          const event = await transaction.trackingEvent.create({
            data: {
              shipmentId,
              source: TrackingEventSource.ADMIN,
              createdById: actorId,
              status: input.status,
              description: input.description,
              location: input.location,
              city: input.city,
              countryCode: input.countryCode,
              occurredAt: input.occurredAt,
            },
            select: { id: true },
          });

          if (shipmentUpdate) {
            await transaction.shipment.update({
              where: { id: shipmentId },
              data: shipmentUpdate,
            });
          }
          return event;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to add tracking event");
}
