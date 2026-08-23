import type { ShipmentStatus } from "@/generated/prisma/enums";
import { getStatusPresentation } from "@/lib/shipment-domain";

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  const presentation = getStatusPresentation(status);
  return (
    <span className={`status-badge status-badge-${presentation.badge}`}>
      {presentation.label}
    </span>
  );
}
