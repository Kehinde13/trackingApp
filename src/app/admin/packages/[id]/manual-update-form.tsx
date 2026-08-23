"use client";

import { useActionState, useEffect, useRef } from "react";

import type { ManualUpdateState } from "./manual-update-state";
import { SHIPMENT_STATUS_OPTIONS, getStatusPresentation } from "@/lib/shipment-domain";

type Props = {
  action: (state: ManualUpdateState, formData: FormData) => Promise<ManualUpdateState>;
  initialState: ManualUpdateState;
};

function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ManualUpdateForm({ action, initialState }: Props) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const occurredAtRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const error = (name: keyof ManualUpdateState["values"]) => state.fieldErrors[name]?.[0];

  useEffect(() => {
    if (state.success) formRef.current?.reset();
    if (occurredAtRef.current && !occurredAtRef.current.value) {
      occurredAtRef.current.value = localDateTimeValue(new Date());
    }
  }, [state.success]);

  return (
    <form ref={formRef} className="manual-update-form" action={formAction} noValidate>
      <div className="panel-heading"><div><h2>Add manual update</h2><p>This shipping-team update will be visible to the customer when public tracking launches.</p></div></div>
      {state.message ? <p className={state.success ? "form-success" : "form-message"} role="status">{state.message}</p> : null}
      <div className="package-form-grid">
        <div className="package-field">
          <label htmlFor="manual-status">Status</label>
          <select id="manual-status" name="status" defaultValue={state.values.status} aria-invalid={error("status") ? true : undefined} aria-describedby={error("status") ? "manual-status-error" : undefined}>
            {SHIPMENT_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{getStatusPresentation(status).label}</option>)}
          </select>
          {error("status") ? <p id="manual-status-error" className="field-error">{error("status")}</p> : null}
        </div>
        <div className="package-field">
          <label htmlFor="manual-occurred-at">Event date and time</label>
          <input ref={occurredAtRef} id="manual-occurred-at" name="occurredAt" type="datetime-local" defaultValue={state.values.occurredAt} aria-invalid={error("occurredAt") ? true : undefined} aria-describedby={error("occurredAt") ? "manual-occurred-at-error" : undefined} />
          {error("occurredAt") ? <p id="manual-occurred-at-error" className="field-error">{error("occurredAt")}</p> : null}
        </div>
        <div className="package-field package-field-wide">
          <label htmlFor="manual-description">Description</label>
          <textarea id="manual-description" name="description" rows={4} maxLength={500} required defaultValue={state.values.description} aria-invalid={error("description") ? true : undefined} aria-describedby={error("description") ? "manual-description-error" : "manual-description-hint"} />
          {error("description") ? <p id="manual-description-error" className="field-error">{error("description")}</p> : <p id="manual-description-hint" className="field-hint">3–500 characters.</p>}
        </div>
        <div className="package-field">
          <label htmlFor="manual-location">General location</label>
          <input id="manual-location" name="location" maxLength={160} defaultValue={state.values.location} aria-invalid={error("location") ? true : undefined} aria-describedby={error("location") ? "manual-location-error" : undefined} />
          {error("location") ? <p id="manual-location-error" className="field-error">{error("location")}</p> : null}
        </div>
        <div className="package-field">
          <label htmlFor="manual-city">City</label>
          <input id="manual-city" name="city" maxLength={100} defaultValue={state.values.city} autoComplete="address-level2" aria-invalid={error("city") ? true : undefined} aria-describedby={error("city") ? "manual-city-error" : undefined} />
          {error("city") ? <p id="manual-city-error" className="field-error">{error("city")}</p> : null}
        </div>
        <div className="package-field">
          <label htmlFor="manual-country-code">Country code</label>
          <input id="manual-country-code" name="countryCode" maxLength={2} defaultValue={state.values.countryCode} autoComplete="country" aria-invalid={error("countryCode") ? true : undefined} aria-describedby={error("countryCode") ? "manual-country-code-error" : "manual-country-code-hint"} />
          {error("countryCode") ? <p id="manual-country-code-error" className="field-error">{error("countryCode")}</p> : <p id="manual-country-code-hint" className="field-hint">Two letters, such as NG.</p>}
        </div>
      </div>
      <div className="package-form-actions"><button type="submit" disabled={pending}>{pending ? "Adding update…" : "Add tracking update"}</button></div>
    </form>
  );
}
