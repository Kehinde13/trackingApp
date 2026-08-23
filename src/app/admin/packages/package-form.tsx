"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { PackageFormState } from "@/app/admin/packages/form-state";

type PackageFormProps = {
  action: (
    previousState: PackageFormState,
    formData: FormData,
  ) => Promise<PackageFormState>;
  initialState: PackageFormState;
  cancelHref: string;
  mode: "create" | "edit";
};

type FieldProps = {
  state: PackageFormState;
  name: keyof PackageFormState["values"];
  label: string;
  hint?: string;
  type?: "text" | "date";
  autoComplete?: string;
};

function FormField({
  state,
  name,
  label,
  hint,
  type = "text",
  autoComplete,
}: FieldProps) {
  const error = state.fieldErrors[name]?.[0];
  const descriptionId = `${name}-${error ? "error" : "hint"}`;

  return (
    <div className="package-field">
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        defaultValue={state.values[name]}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? descriptionId : undefined}
      />
      {error ? (
        <p className="field-error" id={descriptionId}>{error}</p>
      ) : hint ? (
        <p className="field-hint" id={descriptionId}>{hint}</p>
      ) : null}
    </div>
  );
}

export function PackageForm({ action, initialState, cancelHref, mode }: PackageFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form className="package-form" action={formAction} noValidate>
      {state.message ? <p className="form-message" role="alert">{state.message}</p> : null}
      <div className="package-form-grid">
        <FormField
          state={state}
          name="reference"
          label="Package reference"
          hint={mode === "create" ? "Leave blank to generate a secure reference." : undefined}
        />
        <FormField state={state} name="recipientName" label="Recipient name" autoComplete="name" />
        <FormField state={state} name="carrierCode" label="Carrier code" hint="For example: dhl" />
        <FormField state={state} name="carrierName" label="Carrier display name" />
        <FormField state={state} name="trackingNumber" label="Tracking number" />
        <FormField state={state} name="estimatedDeliveryAt" label="Estimated delivery date" type="date" />
        <FormField state={state} name="originCity" label="Origin city" autoComplete="address-level2" />
        <FormField state={state} name="originCountryCode" label="Origin country code" hint="Two letters, such as DE" />
        <FormField state={state} name="destinationCity" label="Destination city" autoComplete="address-level2" />
        <FormField state={state} name="destinationCountryCode" label="Destination country code" hint="Two letters, such as NG" />
      </div>
      <div className="package-form-actions">
        <button type="submit" disabled={pending}>
          {pending
            ? mode === "create" ? "Creating package…" : "Saving changes…"
            : mode === "create" ? "Create Package" : "Save changes"}
        </button>
        <Link className="secondary-link" href={cancelHref}>Cancel</Link>
      </div>
    </form>
  );
}
