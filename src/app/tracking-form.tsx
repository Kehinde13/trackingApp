"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parsePublicTrackingInput } from "@/lib/public-tracking";

export function TrackingForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  return <form className="tracking-form" noValidate onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const token = parsePublicTrackingInput(String(data.get("trackingCode") ?? ""), window.location.origin); if (!token) return setError("Enter a valid ParcelTrack secure tracking code or private tracking link."); setError(""); router.push(`/track/${token}`); }}>
    <label htmlFor="tracking-code">Secure tracking code</label><div className="input-row"><div className="input-wrap"><span aria-hidden="true">#</span><input id="tracking-code" name="trackingCode" type="text" autoComplete="off" placeholder="Paste your secure code or private link" aria-describedby="tracking-hint tracking-error" aria-invalid={error ? true : undefined} /></div><button type="submit">Track package<span aria-hidden="true"> →</span></button></div><p id="tracking-hint">You’ll find the secure code in the private link shared with you.</p>{error ? <p id="tracking-error" className="field-error" role="alert">{error}</p> : null}
  </form>;
}
