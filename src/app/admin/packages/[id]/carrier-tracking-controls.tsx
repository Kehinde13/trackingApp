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
};

export function CarrierTrackingControls({ registerAction, syncAction, initialState, canRegister, canSync, defaultCarrierCode }: Props) {
  const [registerState, submitRegister, registering] = useActionState(registerAction, initialState);
  const [syncState, submitSync, syncing] = useActionState(syncAction, initialState);
  return <div className="carrier-actions">
    {canRegister ? <form action={submitRegister}>
      <label htmlFor="provider-carrier-code">17TRACK carrier code <span>(optional)</span></label>
      <div className="carrier-action-row"><input id="provider-carrier-code" name="providerCarrierCode" defaultValue={defaultCarrierCode} inputMode="numeric" pattern="[0-9]{1,10}" maxLength={10} /><button disabled={registering || syncing}>{registering ? "Registering…" : "Register with carrier provider"}</button></div>
      {registerState.message ? <p className={registerState.success ? "form-success" : "form-message"} role="status">{registerState.message}</p> : null}
    </form> : null}
    {canSync ? <form action={submitSync}><button disabled={syncing || registering}>{syncing ? "Synchronizing…" : "Sync now"}</button>{syncState.message ? <p className={syncState.success ? "form-success" : "form-message"} role="status">{syncState.message}</p> : null}</form> : null}
  </div>;
}
