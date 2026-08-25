"use client";

import { useActionState } from "react";

import type { CarrierActionState } from "./carrier-tracking-actions";

type Props = {
  registerAction: (state: CarrierActionState, data: FormData) => Promise<CarrierActionState>;
  syncAction: (state: CarrierActionState, data: FormData) => Promise<CarrierActionState>;
  initialState: CarrierActionState;
  canRegister: boolean;
  canSync: boolean;
  defaultCarrierCode: string;
  providerName: string;
};

export function CarrierTrackingControls({ registerAction, syncAction, initialState, canRegister, canSync, defaultCarrierCode, providerName }: Props) {
  const [registerState, submitRegister, registering] = useActionState(registerAction, initialState);
  const [syncState, submitSync, syncing] = useActionState(syncAction, initialState);
  return <div className="carrier-actions">
    {canRegister ? <form action={submitRegister}>
      <label htmlFor="provider-carrier-code">{providerName} courier code <span>(optional)</span></label>
      <div className="carrier-action-row"><input id="provider-carrier-code" name="providerCarrierCode" defaultValue={defaultCarrierCode} pattern="[A-Za-z0-9_-]{1,64}" maxLength={64} /><button disabled={registering || syncing}>{registering ? "Registering…" : "Register with carrier provider"}</button></div>
      {registerState.message ? <p className={registerState.success ? "form-success" : "form-message"} role="status">{registerState.message}</p> : null}
    </form> : null}
    {canSync ? <form action={submitSync}><button disabled={syncing || registering}>{syncing ? "Synchronizing…" : "Sync now"}</button>{syncState.message ? <p className={syncState.success ? "form-success" : "form-message"} role="status">{syncState.message}</p> : null}</form> : null}
  </div>;
}
