import Link from "next/link";
import { notFound } from "next/navigation";

import { StatusBadge } from "@/app/admin/packages/status-badge";
import { requireAdminPage } from "@/lib/admin-session";
import { getStatusPresentation } from "@/lib/shipment-domain";
import { getShipmentDetails } from "@/lib/shipments";

type PackageDetailsPageProps = { params: Promise<{ id: string }> };

function show(value: string | null) { return value || "Not provided"; }
function place(city: string | null, country: string | null) { return [city, country].filter(Boolean).join(", ") || "Not provided"; }
function dateTime(value: Date) { return value.toLocaleString("en", { dateStyle: "medium", timeStyle: "short" }); }

export default async function PackageDetailsPage({ params }: PackageDetailsPageProps) {
  const { id } = await params;
  await requireAdminPage(`/admin/packages/${id}`);
  const shipment = await getShipmentDetails(id);
  if (!shipment) notFound();

  return (
    <main className="admin-content-page">
      <div className="content-breadcrumbs"><Link href="/admin">Packages</Link><span>/</span><span>{shipment.reference}</span></div>
      <header className="content-header detail-header">
        <div><p className="auth-kicker">Package details</p><h1>{shipment.reference}</h1><p>Created {dateTime(shipment.createdAt)}</p></div>
        <div className="dashboard-actions"><StatusBadge status={shipment.status} /><Link className="primary-link" href={`/admin/packages/${shipment.id}/edit`}>Edit Package</Link></div>
      </header>

      <section className="detail-grid">
        <article className="content-card"><h2>Shipment metadata</h2><dl className="metadata-list">
          <div><dt>Recipient</dt><dd>{show(shipment.recipientName)}</dd></div>
          <div><dt>Carrier</dt><dd>{shipment.carrierName || shipment.carrierCode || "Not connected"}</dd></div>
          <div><dt>Carrier code</dt><dd>{show(shipment.carrierCode)}</dd></div>
          <div><dt>Tracking number</dt><dd className="tracking-full">{show(shipment.trackingNumber)}</dd></div>
          <div><dt>Origin</dt><dd>{place(shipment.originCity, shipment.originCountryCode)}</dd></div>
          <div><dt>Destination</dt><dd>{place(shipment.destinationCity, shipment.destinationCountryCode)}</dd></div>
          <div><dt>Estimated delivery</dt><dd>{shipment.estimatedDeliveryAt ? shipment.estimatedDeliveryAt.toLocaleDateString("en", { dateStyle: "long" }) : "Not provided"}</dd></div>
          <div><dt>Current status</dt><dd>{getStatusPresentation(shipment.status).label}</dd></div>
          <div><dt>Last updated</dt><dd>{dateTime(shipment.updatedAt)}</dd></div>
        </dl></article>
        <aside className="content-card private-link-card"><h2>Private tracking destination</h2><code>/track/{shipment.publicToken}</code><p>The customer tracking page is not live yet. It will be implemented in the next checkpoint.</p></aside>
      </section>

      <section className="content-card timeline-card" aria-labelledby="timeline-title">
        <div className="panel-heading"><div><h2 id="timeline-title">Tracking history</h2><p>{shipment.trackingEvents.length} event{shipment.trackingEvents.length === 1 ? "" : "s"}, oldest first</p></div></div>
        {shipment.trackingEvents.length ? <ol className="tracking-timeline">{shipment.trackingEvents.map((event) => (
          <li key={event.id}><span className="timeline-dot" aria-hidden="true" /><div className="timeline-event"><div className="timeline-event-heading"><strong>{event.description}</strong><span className={`source-label source-${event.source.toLowerCase()}`}>{event.source}</span></div><p>{getStatusPresentation(event.status).label}{event.location ? ` · ${event.location}` : event.city || event.countryCode ? ` · ${place(event.city, event.countryCode)}` : ""}</p><time dateTime={event.occurredAt.toISOString()}>{dateTime(event.occurredAt)}</time></div></li>
        ))}</ol> : <p className="package-empty">No tracking events are available.</p>}
      </section>
    </main>
  );
}
