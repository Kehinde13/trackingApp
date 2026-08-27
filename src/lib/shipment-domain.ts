import { randomBytes } from "node:crypto";

import { ShipmentStatus } from "@/generated/prisma/enums";

export const PACKAGE_PAGE_SIZE = 20;

export const SHIPMENT_STATUS_OPTIONS = Object.values(ShipmentStatus);

const STATUS_PRESENTATION: Record<
  ShipmentStatus,
  { label: string; badge: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  PENDING: { label: "Pending", badge: "neutral" },
  INFO_RECEIVED: { label: "Information received", badge: "info" },
  PICKED_UP: { label: "Picked up", badge: "info" },
  IN_TRANSIT: { label: "In transit", badge: "info" },
  CUSTOMS: { label: "Customs", badge: "warning" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", badge: "info" },
  DELIVERED: { label: "Delivered", badge: "success" },
  DELAYED: { label: "Delayed", badge: "warning" },
  EXCEPTION: { label: "Exception", badge: "danger" },
  RETURNED: { label: "Returned", badge: "danger" },
  CANCELLED: { label: "Cancelled", badge: "danger" },
};

export type PackageSearchParams = {
  query: string;
  status: ShipmentStatus | null;
  carrier: string;
  page: number;
};

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeCarrierCode(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeCarrierName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeTrackingNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeCountryCode(value: string): string {
  return value.trim().toUpperCase();
}

export function generateShipmentReference(): string {
  const randomPart = randomBytes(6).toString("hex").toUpperCase();
  return `PT-${randomPart.slice(0, 6)}-${randomPart.slice(6)}`;
}

export async function generateUniqueShipmentReference(
  isTaken: (reference: string) => Promise<boolean>,
  attempts = 6,
): Promise<string> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const reference = generateShipmentReference();
    if (!(await isTaken(reference))) return reference;
  }

  throw new Error("Unable to generate a unique package reference");
}

export function getStatusPresentation(status: ShipmentStatus) {
  return STATUS_PRESENTATION[status];
}

export function isInTransitStatus(status: ShipmentStatus): boolean {
  const statuses: ShipmentStatus[] = [
    ShipmentStatus.PICKED_UP,
    ShipmentStatus.IN_TRANSIT,
    ShipmentStatus.CUSTOMS,
    ShipmentStatus.OUT_FOR_DELIVERY,
  ];
  return statuses.includes(status);
}

export function isAttentionStatus(status: ShipmentStatus): boolean {
  const statuses: ShipmentStatus[] = [
    ShipmentStatus.DELAYED,
    ShipmentStatus.EXCEPTION,
  ];
  return statuses.includes(status);
}

export function maskTrackingNumber(value: string | null): string {
  if (!value) return "Not connected";
  if (value.length <= 4) return "•".repeat(value.length);
  return `${"•".repeat(Math.min(8, value.length - 4))}${value.slice(-4)}`;
}

export function parsePackageSearchParams(
  raw: RawSearchParams,
): PackageSearchParams {
  const statusCandidate = firstValue(raw.status).toUpperCase();
  const parsedPage = Number.parseInt(firstValue(raw.page), 10);

  return {
    query: firstValue(raw.query).trim().slice(0, 100),
    status: SHIPMENT_STATUS_OPTIONS.includes(statusCandidate as ShipmentStatus)
      ? (statusCandidate as ShipmentStatus)
      : null,
    carrier: normalizeCarrierCode(firstValue(raw.carrier)).slice(0, 40),
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  };
}

export function packageSearchQueryString(
  filters: PackageSearchParams,
  page: number,
): string {
  const params = new URLSearchParams();
  if (filters.query) params.set("query", filters.query);
  if (filters.status) params.set("status", filters.status);
  if (filters.carrier) params.set("carrier", filters.carrier);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "";
}
