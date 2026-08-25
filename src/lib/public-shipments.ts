import "server-only";

import type { ShipmentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { isValidPublicTrackingToken, maskPublicTrackingNumber, PUBLIC_SOURCE_LABELS } from "@/lib/public-tracking";

export type PublicTrackingEventDto = { status: ShipmentStatus; description: string; location: string | null; city: string | null; countryCode: string | null; occurredAt: string | null; providerOccurredAt: string | null; sourceLabel: string };
export type PublicShipmentDto = { reference: string; status: ShipmentStatus; carrierName: string | null; maskedTrackingNumber: string | null; originCity: string | null; originCountryCode: string | null; destinationCity: string | null; destinationCountryCode: string | null; estimatedDeliveryAt: string | null; deliveredAt: string | null; lastUpdateAt: string; events: PublicTrackingEventDto[] };

export async function getPublicShipment(token: string): Promise<PublicShipmentDto | null> {
  if (!isValidPublicTrackingToken(token)) return null;
  const shipment = await prisma.shipment.findUnique({
    where: { publicToken: token },
    select: {
      reference: true, status: true, carrierName: true, carrierCode: true, trackingNumber: true,
      originCity: true, originCountryCode: true, destinationCity: true, destinationCountryCode: true,
      estimatedDeliveryAt: true, deliveredAt: true, updatedAt: true,
      trackingEvents: {
        orderBy: [{ occurredAt: { sort: "asc", nulls: "last" } }, { providerEventOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { id: true, status: true, description: true, location: true, city: true, countryCode: true, occurredAt: true, providerOccurredAt: true, providerEventOrder: true, createdAt: true, source: true },
      },
    },
  });
  if (!shipment) return null;
  return {
    reference: shipment.reference,
    status: shipment.status,
    carrierName: shipment.carrierName ?? shipment.carrierCode,
    maskedTrackingNumber: maskPublicTrackingNumber(shipment.trackingNumber),
    originCity: shipment.originCity,
    originCountryCode: shipment.originCountryCode,
    destinationCity: shipment.destinationCity,
    destinationCountryCode: shipment.destinationCountryCode,
    estimatedDeliveryAt: shipment.estimatedDeliveryAt?.toISOString() ?? null,
    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    lastUpdateAt: shipment.updatedAt.toISOString(),
    events: shipment.trackingEvents.map((event) => ({ status: event.status, description: event.description, location: event.location, city: event.city, countryCode: event.countryCode, occurredAt: event.occurredAt?.toISOString() ?? null, providerOccurredAt: event.providerOccurredAt, sourceLabel: PUBLIC_SOURCE_LABELS[event.source] })),
  };
}
