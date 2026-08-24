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
