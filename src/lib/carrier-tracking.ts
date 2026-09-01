import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { CarrierConnectionStatus, ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import { MAX_EVENT_AGE_MS, MAX_EVENT_FUTURE_MS } from "@/lib/manual-event-validation";
import { mapCarrierStatus } from "@/lib/carrier-status-mapping";
import { prisma } from "@/lib/prisma";
import {
  TRACKING_ERROR_CODES,
  TrackingProviderError,
  carrierEventId,
  trackingRequestSchema,
  type NormalizedCarrierEvent,
  type SnapshotAbsenceReason,
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
    select: { id: true, trackingNumber: true, originCountryCode: true, destinationCountryCode: true, carrierConnectionStatus: true, trackingProvider: true, providerCarrierCode: true },
  });
  if (!shipment) throw new CarrierTrackingOperationError("SHIPMENT_NOT_FOUND");
  if (shipment.carrierConnectionStatus === CarrierConnectionStatus.ACTIVE && shipment.trackingProvider === provider.name) {
    return { alreadyActive: true };
  }
  const request = trackingRequestSchema.safeParse({
    trackingNumber: shipment.trackingNumber ?? "",
    carrierCode: suppliedCarrierCode || shipment.providerCarrierCode || undefined,
    clientTrackerId: `parceltrack:${shipment.id}`,
    originCountryCode: shipment.originCountryCode ?? undefined,
    destinationCountryCode: shipment.destinationCountryCode ?? undefined,
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
        providerTrackerId: result.providerTrackerId,
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
  if (event.occurredAt === null) return Boolean(event.providerOccurredAt);
  const timestamp = event.occurredAt.getTime();
  return Number.isFinite(timestamp) && timestamp <= now + MAX_EVENT_FUTURE_MS && timestamp >= now - MAX_EVENT_AGE_MS;
}

type CarrierImportShipment = {
  id: string;
  trackingNumber: string;
  providerCarrierCode: string | null;
};

type StatusPoint = { status: ShipmentStatus; occurredAt: Date };
type ShipmentStatusUpdate = { status: ShipmentStatus; deliveredAt?: Date };

export type StatusReconciliationOutcome =
  | SnapshotAbsenceReason
  | "provider_without_snapshot"
  | "snapshot_status_unmapped"
  | "stale_snapshot"
  | "stale_carrier"
  | "admin_precedence"
  | "already_current"
  | "applied";

export type CarrierStatusReconciliationResult = {
  statusUpdate: ShipmentStatusUpdate | null;
  outcome: StatusReconciliationOutcome;
};

type CarrierStatusReconciliationInput = {
  hasAuthoritativeStatus: boolean;
  snapshotAbsenceReason?: SnapshotAbsenceReason;
  storedStatus: ShipmentStatus;
  authoritativeStatus: ShipmentStatus | null;
  authoritativeFreshnessAt: Date | null;
  authoritativeProviderGeneratedAt: Date | null;
  previousSyncAt: Date | null;
  newestCarrierBefore: Date | null;
  newestAdmin: Date | null;
  fallbackNewest: StatusPoint | null;
  newestDeliveredAt: Date | null;
};

export function reconcileCarrierStatus({
  hasAuthoritativeStatus,
  snapshotAbsenceReason,
  storedStatus,
  authoritativeStatus,
  authoritativeFreshnessAt,
  authoritativeProviderGeneratedAt,
  previousSyncAt,
  newestCarrierBefore,
  newestAdmin,
  fallbackNewest,
  newestDeliveredAt,
}: CarrierStatusReconciliationInput): CarrierStatusReconciliationResult {
  if (hasAuthoritativeStatus) {
    if (!authoritativeStatus) return { statusUpdate: null, outcome: "snapshot_status_unmapped" };
    if (!authoritativeFreshnessAt) {
      return { statusUpdate: null, outcome: snapshotAbsenceReason ?? "snapshot_absent" };
    }
    if (!authoritativeProviderGeneratedAt) {
      return { statusUpdate: null, outcome: snapshotAbsenceReason ?? "snapshot_missing_generated_at" };
    }
    if (previousSyncAt && authoritativeFreshnessAt.getTime() < previousSyncAt.getTime()) {
      return { statusUpdate: null, outcome: "stale_snapshot" };
    }
    if (newestCarrierBefore && authoritativeProviderGeneratedAt.getTime() < newestCarrierBefore.getTime()) {
      return { statusUpdate: null, outcome: "stale_carrier" };
    }
    if (newestAdmin && newestAdmin.getTime() > authoritativeProviderGeneratedAt.getTime()) {
      return { statusUpdate: null, outcome: "admin_precedence" };
    }
    const statusUpdate = authoritativeStatus === ShipmentStatus.DELIVERED && newestDeliveredAt
      ? { status: authoritativeStatus, deliveredAt: newestDeliveredAt }
      : { status: authoritativeStatus };
    return { statusUpdate, outcome: authoritativeStatus === storedStatus ? "already_current" : "applied" };
  }

  const statusUpdate = !fallbackNewest
    ? null
    : fallbackNewest.status === ShipmentStatus.DELIVERED
    ? { status: fallbackNewest.status, deliveredAt: fallbackNewest.occurredAt }
    : { status: fallbackNewest.status };
  return {
    statusUpdate,
    outcome: snapshotAbsenceReason ?? "provider_without_snapshot",
  };
}

export async function importCarrierTrackingInfo(
  tx: Prisma.TransactionClient,
  shipment: CarrierImportShipment,
  providerName: string,
  info: TrackingInfo,
  synchronizedAt = new Date(),
  snapshotSource: "pull" | "webhook" = "pull",
) {
  const now = synchronizedAt.getTime();
  const storedShipment = await tx.shipment.findUniqueOrThrow({
    where: { id: shipment.id },
    select: { status: true, carrierLastSuccessfulSyncAt: true },
  });
  const candidates = info.events
    .filter((event) => validEvent(event, now))
    .map((event) => ({ event, mappedStatus: mapCarrierStatus(providerName, event.providerStatus, event.providerSubStatus) }));
  const hasAuthoritativeStatus = info.currentStatus !== undefined;
  const authoritativeStatus = info.currentStatus
    ? mapCarrierStatus(providerName, info.currentStatus.providerStatus, info.currentStatus.providerSubStatus)
    : null;
  const unknown = candidates.some(({ mappedStatus }) => mappedStatus === null) ||
    (hasAuthoritativeStatus && authoritativeStatus === null);
  const warning = unknown ? TRACKING_ERROR_CODES.UNKNOWN_STATUS : null;
  const importable = candidates.filter(({ mappedStatus }) => mappedStatus !== null || providerName === "ship24");
  const newestCarrierBefore = await tx.trackingEvent.findFirst({
    where: { shipmentId: shipment.id, source: TrackingEventSource.CARRIER, occurredAt: { not: null }, statusAffectsShipment: true },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { occurredAt: true },
  });
  const createResult = importable.length
    ? await tx.trackingEvent.createMany({
        data: importable.map(({ event, mappedStatus }) => ({
          shipmentId: shipment.id,
          source: TrackingEventSource.CARRIER,
          status: mappedStatus ?? storedShipment.status,
          description: event.description,
          location: event.location,
          city: event.city,
          countryCode: event.countryCode,
          occurredAt: event.occurredAt,
          providerOccurredAt: event.providerOccurredAt,
          providerEventOrder: event.providerEventOrder,
          statusAffectsShipment: mappedStatus !== null && event.occurredAt !== null,
          providerEventId: carrierEventId(providerName, shipment.trackingNumber, event),
        })),
        skipDuplicates: true,
      })
    : { count: 0 };
  const newest = await tx.trackingEvent.findFirst({
    where: { shipmentId: shipment.id, occurredAt: { not: null }, statusAffectsShipment: true },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { status: true, occurredAt: true },
  });
  const newestAdmin = await tx.trackingEvent.findFirst({
    where: { shipmentId: shipment.id, source: TrackingEventSource.ADMIN, occurredAt: { not: null }, statusAffectsShipment: true },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { occurredAt: true },
  });
  const newestDelivered = await tx.trackingEvent.findFirst({
    where: { shipmentId: shipment.id, status: ShipmentStatus.DELIVERED, occurredAt: { not: null }, statusAffectsShipment: true },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { occurredAt: true },
  });
  const reconciliation = reconcileCarrierStatus({
    hasAuthoritativeStatus,
    snapshotAbsenceReason: info.snapshotAbsenceReason,
    storedStatus: storedShipment.status,
    authoritativeStatus,
    authoritativeFreshnessAt: info.currentStatus
      ? snapshotSource === "pull" ? synchronizedAt : info.currentStatus.providerGeneratedAt ?? null
      : null,
    authoritativeProviderGeneratedAt: info.currentStatus
      ? info.currentStatus.providerGeneratedAt ?? (
          snapshotSource === "pull" && info.snapshotAbsenceReason === "snapshot_missing_generated_at"
            ? synchronizedAt
            : null
        )
      : null,
    previousSyncAt: storedShipment.carrierLastSuccessfulSyncAt,
    newestCarrierBefore: newestCarrierBefore?.occurredAt ?? null,
    newestAdmin: newestAdmin?.occurredAt ?? null,
    fallbackNewest: newest?.occurredAt ? { status: newest.status, occurredAt: newest.occurredAt } : null,
    newestDeliveredAt: newestDelivered?.occurredAt ?? null,
  });
  const data: Prisma.ShipmentUpdateInput = {
    providerCarrierCode: info.carrierCode ?? shipment.providerCarrierCode,
    carrierConnectionStatus: CarrierConnectionStatus.ACTIVE,
    carrierLastSuccessfulSyncAt: synchronizedAt,
    carrierLastErrorCode: warning,
    carrierLastErrorAt: warning ? synchronizedAt : null,
  };
  if (reconciliation.statusUpdate) Object.assign(data, reconciliation.statusUpdate);
  await tx.shipment.update({ where: { id: shipment.id }, data });
  return { imported: createResult.count, warning, reconciliationOutcome: reconciliation.outcome };
}

export async function syncShipmentTracking(
  shipmentId: string,
  provider: TrackingProvider = createTrackingProvider(),
) {
  if (!provider.enabled) throw new CarrierTrackingOperationError(TRACKING_ERROR_CODES.DISABLED);
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: { trackingNumber: true, providerCarrierCode: true, providerTrackerId: true, trackingProvider: true, carrierConnectionStatus: true },
  });
  if (!shipment) throw new CarrierTrackingOperationError("SHIPMENT_NOT_FOUND");
  if (shipment.carrierConnectionStatus !== CarrierConnectionStatus.ACTIVE || shipment.trackingProvider !== provider.name) {
    throw new CarrierTrackingOperationError("PROVIDER_NOT_ACTIVE");
  }
  const request = trackingRequestSchema.safeParse({ trackingNumber: shipment.trackingNumber ?? "", carrierCode: shipment.providerCarrierCode ?? undefined, providerTrackerId: shipment.providerTrackerId ?? undefined });
  if (!request.success) throw new CarrierTrackingOperationError(TRACKING_ERROR_CODES.INVALID_INPUT);

  let info;
  try { info = await provider.getTrackingInfo(request.data); }
  catch (error: unknown) { await setConnectionError(shipmentId, error); throw new CarrierTrackingOperationError(safeErrorCode(error)); }
  const observedAt = new Date();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) => importCarrierTrackingInfo(tx, {
          id: shipmentId,
          trackingNumber: request.data.trackingNumber,
          providerCarrierCode: shipment.providerCarrierCode,
        }, provider.name, info, observedAt, "pull"),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new CarrierTrackingOperationError(TRACKING_ERROR_CODES.UNAVAILABLE);
}
