import { z } from "zod";

import {
  normalizeCarrierCode,
  normalizeCarrierName,
  normalizeCountryCode,
  normalizeReference,
  normalizeTrackingNumber,
} from "@/lib/shipment-domain";

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .refine((value) => !CONTROL_CHARACTERS.test(value), `${label} contains invalid characters.`)
    .transform((value) => (value === "" ? null : value));

const optionalCountryCode = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^[A-Za-z]{2}$/.test(value),
    "Use a two-letter country code.",
  )
  .transform((value) => (value === "" ? null : normalizeCountryCode(value)));

const optionalDate = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
    "Enter a valid delivery date.",
  )
  .transform((value, context) => {
    if (value === "") return null;
    const date = new Date(`${value}T12:00:00.000Z`);
    if (
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    ) {
      context.addIssue({ code: "custom", message: "Enter a valid delivery date." });
      return z.NEVER;
    }
    return date;
  });

const reference = z
  .string()
  .trim()
  .max(50, "Reference must be 50 characters or fewer.")
  .refine(
    (value) => value === "" || /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value),
    "Use letters, numbers, hyphens, or underscores.",
  )
  .transform((value) => (value === "" ? null : normalizeReference(value)));

const trackingNumber = z
  .string()
  .trim()
  .max(60, "Tracking number must be 60 characters or fewer.")
  .refine(
    (value) => value === "" || /^[A-Za-z0-9][A-Za-z0-9\s-]*$/.test(value),
    "Tracking number contains unsupported characters.",
  )
  .transform((value) => (value === "" ? null : normalizeTrackingNumber(value)));

const packageMetadataShape = {
  recipientName: optionalText("Recipient name", 120),
  carrierCode: optionalText("Carrier code", 40).transform((value) =>
    value === null ? null : normalizeCarrierCode(value),
  ),
  carrierName: optionalText("Carrier name", 80).transform((value) =>
    value === null ? null : normalizeCarrierName(value),
  ),
  trackingNumber,
  originCity: optionalText("Origin city", 100),
  originCountryCode: optionalCountryCode,
  destinationCity: optionalText("Destination city", 100),
  destinationCountryCode: optionalCountryCode,
  estimatedDeliveryAt: optionalDate,
};

export const createPackageSchema = z.object({
  reference,
  ...packageMetadataShape,
});

export const editPackageSchema = z.object({
  reference: reference.refine((value) => value !== null, "Reference is required."),
  ...packageMetadataShape,
});

export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type EditPackageInput = z.infer<typeof editPackageSchema>;

export const PACKAGE_FORM_FIELDS = [
  "reference",
  "recipientName",
  "carrierCode",
  "carrierName",
  "trackingNumber",
  "originCity",
  "originCountryCode",
  "destinationCity",
  "destinationCountryCode",
  "estimatedDeliveryAt",
] as const;

export type PackageFormField = (typeof PACKAGE_FORM_FIELDS)[number];

export function packageFormDataToRecord(formData: FormData) {
  return Object.fromEntries(
    PACKAGE_FORM_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as Record<PackageFormField, string>;
}
