import { ShipmentStatus } from "@/generated/prisma/enums";
import type { ManualEventFormField } from "@/lib/manual-event-validation";

export type ManualUpdateState = {
  success: boolean;
  message: string;
  fieldErrors: Partial<Record<ManualEventFormField, string[]>>;
  values: Record<ManualEventFormField, string>;
};

export const INITIAL_MANUAL_UPDATE_STATE: ManualUpdateState = {
  success: false,
  message: "",
  fieldErrors: {},
  values: {
    status: ShipmentStatus.IN_TRANSIT,
    description: "",
    location: "",
    city: "",
    countryCode: "",
    occurredAt: "",
  },
};
