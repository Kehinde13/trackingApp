import { ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";

export const PUBLIC_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function isValidPublicTrackingToken(value: string): boolean {
  return value.length === 32 && PUBLIC_TOKEN_PATTERN.test(value);
}

export function parsePublicTrackingInput(input: string, origin: string): string | null {
  const value = input.trim();
  if (isValidPublicTrackingToken(value)) return value;
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.search || url.hash) return null;
    const match = url.pathname.match(/^\/track\/([^/]+)\/?$/);
    return match && isValidPublicTrackingToken(match[1]) ? match[1] : null;
  } catch {
    return null;
  }
}

export const PUBLIC_SOURCE_LABELS: Record<TrackingEventSource, string> = {
  CARRIER: "Carrier update",
  ADMIN: "Shipping team update",
  SYSTEM: "System update",
};

const STANDARD_PROGRESS = [
  ShipmentStatus.PENDING,
  ShipmentStatus.INFO_RECEIVED,
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.CUSTOMS,
  ShipmentStatus.OUT_FOR_DELIVERY,
  ShipmentStatus.DELIVERED,
] as const;

export function getPublicProgress(status: ShipmentStatus) {
  const index = STANDARD_PROGRESS.indexOf(status as (typeof STANDARD_PROGRESS)[number]);
  return index >= 0
    ? { kind: "standard" as const, currentIndex: index, steps: STANDARD_PROGRESS }
    : { kind: "attention" as const, status };
}

export function maskPublicTrackingNumber(value: string | null): string | null {
  if (!value) return null;
  const visible = value.slice(-4);
  return `${"•".repeat(Math.min(8, Math.max(4, value.length - 4)))}${visible}`;
}
