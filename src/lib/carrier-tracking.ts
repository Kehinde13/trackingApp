import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { CarrierConnectionStatus, ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import { MAX_EVENT_AGE_MS, MAX_EVENT_FUTURE_MS } from "@/lib/manual-event-validation";
import { map17TrackStatus } from "@/lib/carrier-status-mapping";
import { prisma } from "@/lib/prisma";
import {
  TRACKING_ERROR_CODES,
  TrackingProviderError,
  carrierEventId,
  trackingRequestSchema,
  type NormalizedCarrierEvent,
  type TrackingInfo,
  type TrackingProvider,
} from "@/lib/tracking-provider";
import { createTrackingProvider } from "@/lib/tracking-provider-config";

export class CarrierTrackingOperationError extends Error {
  constructor(readonly code: string) { super(code); this.name = "CarrierTrackingOperationError"; }
}

function safeErrorCode(error: unknown): string {
  return error instanceof TrackingProviderError ? error.code : TRACKING_ERROR_CODES.UNAVAILABLE;
}

async function setConnectionError(shipmentId: string, error: unknown) {
  await prisma.shipment.update({
    where: { id: shipmentId },
    data: {
      carrierConnectionStatus: CarrierConnectionStatus.ERROR,
      carrierLastErrorCode: safeErrorCode(error),
      carrierLastErrorAt: new Date(),
    },
  });
}

export async function registerShipmentTracking(
  shipmentId: string,
  suppliedCarrierCode?: string,
  provider: TrackingProvider = createTrackingProvider(),
) {
  if (!provider.enabled) throw new CarrierTrackingOperationError(TRACKING_ERROR_CODES.DISABLED);
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { trackingNumber: true, carrierConnectionStatus: true, trackingProvider: true, providerCarrierCode: true },
  });
  if (!shipment) throw new CarrierTrackingOperationError("SHIPMENT_NOT_FOUND");
  if (shipment.carrierConnectionStatus === CarrierConnectionStatus.ACTIVE && shipment.trackingProvider === provider.name) {
    return { alreadyActive: true };
  }
  const request = trackingRequestSchema.safeParse({
    trackingNumber: shipment.trackingNumber ?? "",
    carrierCode: suppliedCarrierCode || shipment.providerCarrierCode || undefined,
  });
  if (!request.success) throw new CarrierTrackingOperationError(TRACKING_ERROR_CODES.INVALID_INPUT);
  const claimed = await prisma.shipment.updateMany({
    where: { id: shipmentId, carrierConnectionStatus: { in: [CarrierConnectionStatus.UNLINKED, CarrierConnectionStatus.ERROR] } },
    data: { carrierConnectionStatus: CarrierConnectionStatus.REGISTERING, trackingProvider: provider.name, carrierLastErrorCode: null, carrierLastErrorAt: null },
  });
  if (claimed.count === 0) throw new CarrierTrackingOperationError("OPERATION_IN_PROGRESS");
  try {
    const result = await provider.registerTracking(request.data);
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingProvider: provider.name,
        providerCarrierCode: result.carrierCode ?? request.data.carrierCode,
        carrierConnectionStatus: CarrierConnectionStatus.ACTIVE,
        carrierRegisteredAt: new Date(),
        carrierLastErrorCode: null,
        carrierLastErrorAt: null,
      },
    });
    return { alreadyActive: false };
  } catch (error: unknown) {
    await setConnectionError(shipmentId, error);
    throw new CarrierTrackingOperationError(safeErrorCode(error));
  }
}

function validEvent(event: NormalizedCarrierEvent, now: number) {
  const timestamp = event.occurredAt.getTime();
  return Number.isFinite(timestamp) && timestamp <= now + MAX_EVENT_FUTURE_MS && timestamp >= now - MAX_EVENT_AGE_MS;
}

type CarrierImportShipment = {
  id: string;
  trackingNumber: string;
  providerCarrierCode: string | null;
};

export async function importCarrierTrackingInfo(
  tx: Prisma.TransactionClient,
  shipment: CarrierImportShipment,
  providerName: string,
  info: TrackingInfo,
  synchronizedAt = new Date(),
) {
  const now = synchronizedAt.getTime();
  const recognized = info.events
    .filter((event) => validEvent(event, now))
    .map((event) => ({ event, status: map17TrackStatus(event.providerStatus, event.providerSubStatus) }))
    .filter((item): item is { event: NormalizedCarrierEvent; status: ShipmentStatus } => item.status !== null);
  const unknown = info.events.some(
    (event) => validEvent(event, now) && map17TrackStatus(event.providerStatus, event.providerSubStatus) === null,
  );
  const warning = unknown ? TRACKING_ERROR_CODES.UNKNOWN_STATUS : null;
  const createResult = await tx.trackingEvent.createMany({
    data: recognized.map(({ event, status }) => ({
      shipmentId: shipment.id,
      source: TrackingEventSource.CARRIER,
      status,
      description: event.description,
      location: event.location,
      city: event.city,
      countryCode: event.countryCode,
      occurredAt: event.occurredAt,
      providerEventId: carrierEventId(providerName, shipment.trackingNumber, event),
    })),
    skipDuplicates: true,
  });
  const newest = await tx.trackingEvent.findFirst({
    where: { shipmentId: shipment.id },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { status: true, occurredAt: true },
  });
  const data: Prisma.ShipmentUpdateInput = {
    providerCarrierCode: info.carrierCode ?? shipment.providerCarrierCode,
    carrierConnectionStatus: CarrierConnectionStatus.ACTIVE,
    carrierLastSuccessfulSyncAt: synchronizedAt,
    carrierLastErrorCode: warning,
    carrierLastErrorAt: warning ? synchronizedAt : null,
  };
  if (newest) {
    data.status = newest.status;
    if (newest.status === ShipmentStatus.DELIVERED) data.deliveredAt = newest.occurredAt;
  }
  await tx.shipment.update({ where: { id: shipment.id }, data });
  return { imported: createResult.count, warning };
}

export async function syncShipmentTracking(
  shipmentId: string,
  provider: TrackingProvider = createTrackingProvider(),
) {
  if (!provider.enabled) throw new CarrierTrackingOperationError(TRACKING_ERROR_CODES.DISABLED);
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { trackingNumber: true, providerCarrierCode: true, trackingProvider: true, carrierConnectionStatus: true },
  });
  if (!shipment) throw new CarrierTrackingOperationError("SHIPMENT_NOT_FOUND");
  if (shipment.carrierConnectionStatus !== CarrierConnectionStatus.ACTIVE || shipment.trackingProvider !== provider.name) {
    throw new CarrierTrackingOperationError("PROVIDER_NOT_ACTIVE");
  }
  const request = trackingRequestSchema.safeParse({ trackingNumber: shipment.trackingNumber ?? "", carrierCode: shipment.providerCarrierCode ?? undefined });
  if (!request.success) throw new CarrierTrackingOperationError(TRACKING_ERROR_CODES.INVALID_INPUT);

  let info;
  try { info = await provider.getTrackingInfo(request.data); }
  catch (error: unknown) { await setConnectionError(shipmentId, error); throw new CarrierTrackingOperationError(safeErrorCode(error)); }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => importCarrierTrackingInfo(tx, {
          id: shipmentId,
          trackingNumber: request.data.trackingNumber,
          providerCarrierCode: shipment.providerCarrierCode,
        }, provider.name, info),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new CarrierTrackingOperationError(TRACKING_ERROR_CODES.UNAVAILABLE);
}
