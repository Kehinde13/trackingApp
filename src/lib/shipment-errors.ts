export type ShipmentWriteError = {
  message: string;
  fieldErrors?: Record<string, string[]>;
};

function getUniqueTargets(error: unknown): string[] {
  if (typeof error !== "object" || error === null || !("code" in error)) return [];
  if (error.code !== "P2002" || !("meta" in error)) return [];

  const meta = error.meta;
  if (typeof meta !== "object" || meta === null) return [];
  if ("target" in meta) {
    const target = meta.target;
    if (Array.isArray(target)) {
      return target.filter((item): item is string => typeof item === "string");
    }
    if (typeof target === "string") return [target];
  }

  if (!("driverAdapterError" in meta)) return [];
  const adapterError = meta.driverAdapterError;
  if (typeof adapterError !== "object" || adapterError === null || !("cause" in adapterError)) {
    return [];
  }
  const cause = adapterError.cause;
  if (typeof cause !== "object" || cause === null || !("constraint" in cause)) return [];
  const constraint = cause.constraint;
  if (typeof constraint !== "object" || constraint === null || !("fields" in constraint)) {
    return [];
  }
  const fields = constraint.fields;
  return Array.isArray(fields)
    ? fields.filter((item): item is string => typeof item === "string")
    : [];
}

export function mapShipmentWriteError(error: unknown): ShipmentWriteError {
  const targets = getUniqueTargets(error);

  if (targets.some((target) => target.includes("reference"))) {
    return {
      message: "A package with this reference already exists.",
      fieldErrors: { reference: ["This reference is already in use."] },
    };
  }

  if (
    targets.some(
      (target) => target.includes("carrierCode") || target.includes("trackingNumber"),
    )
  ) {
    return {
      message: "This carrier and tracking number are already assigned to a package.",
      fieldErrors: {
        trackingNumber: ["This carrier and tracking number are already in use."],
      },
    };
  }

  return { message: "Unable to save the package. Please try again." };
}

export function isUniqueReferenceError(error: unknown): boolean {
  return getUniqueTargets(error).some((target) => target.includes("reference"));
}
