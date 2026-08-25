import "server-only";

import { ShipmentStatus } from "@/generated/prisma/enums";

const MAIN_STATUS_MAP: Readonly<Record<string, ShipmentStatus>> = {
  InfoReceived: ShipmentStatus.INFO_RECEIVED,
  InTransit: ShipmentStatus.IN_TRANSIT,
  PickedUp: ShipmentStatus.PICKED_UP,
  Departure: ShipmentStatus.IN_TRANSIT,
  Arrival: ShipmentStatus.IN_TRANSIT,
  AvailableForPickup: ShipmentStatus.IN_TRANSIT,
  OutForDelivery: ShipmentStatus.OUT_FOR_DELIVERY,
  DeliveryFailure: ShipmentStatus.EXCEPTION,
  Delivered: ShipmentStatus.DELIVERED,
  Exception: ShipmentStatus.EXCEPTION,
  Expired: ShipmentStatus.EXCEPTION,
  Returning: ShipmentStatus.RETURNED,
  Returned: ShipmentStatus.RETURNED,
};

const SUB_STATUS_MAP: Readonly<Record<string, ShipmentStatus>> = {
  InTransit_PickedUp: ShipmentStatus.PICKED_UP,
  InTransit_CustomsProcessing: ShipmentStatus.CUSTOMS,
  InTransit_CustomsRequiringInformation: ShipmentStatus.CUSTOMS,
  InTransit_CustomsReleased: ShipmentStatus.IN_TRANSIT,
  Exception_Returning: ShipmentStatus.RETURNED,
  Exception_Returned: ShipmentStatus.RETURNED,
  Exception_Delayed: ShipmentStatus.DELAYED,
  Exception_Cancel: ShipmentStatus.CANCELLED,
};

export function map17TrackStatus(status: string, subStatus?: string): ShipmentStatus | null {
  if (subStatus && SUB_STATUS_MAP[subStatus]) return SUB_STATUS_MAP[subStatus];
  return MAIN_STATUS_MAP[status] ?? null;
}

const SHIP24_MILESTONE_MAP: Readonly<Record<string, ShipmentStatus>> = {
  pending: ShipmentStatus.PENDING,
  info_received: ShipmentStatus.INFO_RECEIVED,
  in_transit: ShipmentStatus.IN_TRANSIT,
  out_for_delivery: ShipmentStatus.OUT_FOR_DELIVERY,
  failed_attempt: ShipmentStatus.EXCEPTION,
  available_for_pickup: ShipmentStatus.IN_TRANSIT,
  delivered: ShipmentStatus.DELIVERED,
  exception: ShipmentStatus.EXCEPTION,
};

const SHIP24_CODE_MAP: Readonly<Record<string, ShipmentStatus>> = {
  transit_handover: ShipmentStatus.PICKED_UP,
  customs_received: ShipmentStatus.CUSTOMS,
  customs_exception: ShipmentStatus.CUSTOMS,
  customs_rejected: ShipmentStatus.EXCEPTION,
  customs_cleared: ShipmentStatus.IN_TRANSIT,
  delivery_out_for_delivery: ShipmentStatus.OUT_FOR_DELIVERY,
  delivery_attempted: ShipmentStatus.EXCEPTION,
  delivery_available_for_pickup: ShipmentStatus.IN_TRANSIT,
  delivery_delivered: ShipmentStatus.DELIVERED,
  exception_return: ShipmentStatus.RETURNED,
  data_order_cancelled: ShipmentStatus.CANCELLED,
};

export function mapShip24Status(milestone: string, statusCode?: string): ShipmentStatus | null {
  if (statusCode && SHIP24_CODE_MAP[statusCode]) return SHIP24_CODE_MAP[statusCode];
  return SHIP24_MILESTONE_MAP[milestone] ?? null;
}

export function mapCarrierStatus(provider: string, status: string, subStatus?: string): ShipmentStatus | null {
  return provider === "ship24"
    ? mapShip24Status(status, subStatus)
    : map17TrackStatus(status, subStatus);
}
