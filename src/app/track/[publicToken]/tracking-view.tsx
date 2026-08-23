"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { PublicShipmentDto } from "@/lib/public-shipments";
import { getPublicProgress } from "@/lib/public-tracking";
import { getStatusPresentation } from "@/lib/shipment-domain";

function showPlace(city: string | null, country: string | null) { return [city, country].filter(Boolean).join(", ") || "Not available"; }
function dateTime(value: string) { return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }

export function TrackingView() {
  const { publicToken } = useParams<{ publicToken: string }>();
  const [shipment, setShipment] = useState<PublicShipmentDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "not-found" | "limited" | "error">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch(`/api/public/track/${encodeURIComponent(publicToken)}`, { cache: "no-store", referrerPolicy: "no-referrer" });
      if (response.status === 404) return setState("not-found");
      if (response.status === 429) return setState("limited");
      if (!response.ok) return setState("error");
      setShipment(await response.json() as PublicShipmentDto);
      setState("ready");
    } catch { setState("error"); }
  }, [publicToken]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (state === "loading") return <main className="public-track-state"><p>Loading the latest available update…</p></main>;
  if (state !== "ready" || !shipment) return <main className="public-track-state"><h1>{state === "not-found" ? "Package not found" : state === "limited" ? "Please try again shortly" : "Tracking is temporarily unavailable"}</h1><p>{state === "not-found" ? "Check that you opened the complete private tracking link." : "We couldn’t retrieve the stored tracking information right now."}</p><button onClick={() => void load()}>Try again</button></main>;
  const progress = getPublicProgress(shipment.status);
  const status = getStatusPresentation(shipment.status);
  return <main className="public-track-page">
    <header className="public-track-header"><Link href="/">ParcelTrack</Link><span>Private package tracking</span></header>
    <section className={`public-status-hero status-${status.badge}`}><p>Latest available update</p><h1>{status.label}</h1><strong>{shipment.reference}</strong><p>Last updated {dateTime(shipment.lastUpdateAt)}</p><button onClick={() => void load()}>Refresh stored updates</button></section>
    {progress.kind === "standard" ? <ol className="public-progress" aria-label="Package progress">{progress.steps.map((step, index) => <li key={step} aria-current={index === progress.currentIndex ? "step" : undefined} className={index <= progress.currentIndex ? "complete" : ""}><span aria-hidden="true">{index < progress.currentIndex ? "✓" : index === progress.currentIndex ? "●" : "○"}</span>{getStatusPresentation(step).label}</li>)}</ol> : <section className="public-attention"><h2>{status.label}</h2><p>This package needs attention. Refer to the latest timeline update for available details.</p></section>}
    <section className="public-summary"><h2>Shipment summary</h2><dl><div><dt>Carrier</dt><dd>{shipment.carrierName || "Not connected"}</dd></div><div><dt>Tracking number</dt><dd>{shipment.maskedTrackingNumber || "Not available"}</dd></div><div><dt>Origin</dt><dd>{showPlace(shipment.originCity, shipment.originCountryCode)}</dd></div><div><dt>Destination</dt><dd>{showPlace(shipment.destinationCity, shipment.destinationCountryCode)}</dd></div><div><dt>Estimated delivery</dt><dd>{shipment.estimatedDeliveryAt ? dateTime(shipment.estimatedDeliveryAt) : "Not currently available"}</dd></div>{shipment.deliveredAt ? <div><dt>Delivered</dt><dd>{dateTime(shipment.deliveredAt)}</dd></div> : null}</dl></section>
    <section className="public-timeline"><h2>Tracking timeline</h2><p>Updates may come from the carrier, shipping team, or ParcelTrack system.</p>{shipment.events.length ? <ol>{shipment.events.map((event, index) => <li key={`${event.occurredAt}-${index}`}><span className="timeline-dot" aria-hidden="true" /><div><div className="timeline-event-heading"><strong>{event.description}</strong><span className="source-label">{event.sourceLabel}</span></div><p>{getStatusPresentation(event.status).label}{event.location ? ` · ${event.location}` : event.city || event.countryCode ? ` · ${showPlace(event.city, event.countryCode)}` : ""}</p><time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time></div></li>)}</ol> : <p>No tracking events are available yet.</p>}</section>
    <footer className="public-track-footer"><strong>ParcelTrack</strong><p>Delivery estimates are not guarantees. This page shows the latest stored information.</p></footer>
  </main>;
}
