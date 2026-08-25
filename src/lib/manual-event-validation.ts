import { z } from "zod";

import { ShipmentStatus } from "@/generated/prisma/enums";

const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/;
export const MAX_EVENT_AGE_MS = 10 * 365 * 24 * 60 * 60 * 1000;
export const MAX_EVENT_FUTURE_MS = 10 * 60 * 1000;
// Internal manual-event form contract: browser-local wall time is converted to
// this canonical UTC representation before the authenticated server action runs.
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .refine((value) => !CONTROL_CHARACTERS.test(value), `${label} contains invalid characters.`)
    .transform((value) => (value === "" ? null : value));

const occurredAt = z.string().trim().transform((value, context) => {
  if (!UTC_ISO_PATTERN.test(value)) {
    context.addIssue({ code: "custom", message: "Enter a valid event date and time." });
    return z.NEVER;
  }

  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    context.addIssue({ code: "custom", message: "Enter a valid event date and time." });
    return z.NEVER;
  }

  const now = Date.now();
  if (date.getTime() > now + MAX_EVENT_FUTURE_MS) {
    context.addIssue({ code: "custom", message: "Event time cannot be more than 10 minutes in the future." });
    return z.NEVER;
  }
  if (date.getTime() < now - MAX_EVENT_AGE_MS) {
    context.addIssue({ code: "custom", message: "Event time is unreasonably far in the past." });
    return z.NEVER;
  }
  return date;
});

export const manualEventSchema = z.object({
  status: z.enum(ShipmentStatus, { error: "Select a valid shipment status." }),
  description: z
    .string()
    .trim()
    .min(3, "Description must be at least 3 characters.")
    .max(500, "Description must be 500 characters or fewer.")
    .refine(
      (value) => !CONTROL_CHARACTERS.test(value),
      "Description contains invalid characters.",
    ),
  location: optionalText("Location", 160),
  city: optionalText("City", 100),
  countryCode: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^[A-Za-z]{2}$/.test(value),
      "Use a two-letter country code.",
    )
    .transform((value) => (value === "" ? null : value.toUpperCase())),
  occurredAt,
});

export type ManualEventInput = z.infer<typeof manualEventSchema>;

export const MANUAL_EVENT_FORM_FIELDS = [
  "status",
  "description",
  "location",
  "city",
  "countryCode",
  "occurredAt",
] as const;

export type ManualEventFormField = (typeof MANUAL_EVENT_FORM_FIELDS)[number];

export function manualEventFormDataToRecord(formData: FormData) {
  return Object.fromEntries(
    MANUAL_EVENT_FORM_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]),
  ) as Record<ManualEventFormField, string>;
}
