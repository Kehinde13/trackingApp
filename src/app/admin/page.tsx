import Link from "next/link";

import { SignOutButton } from "@/app/admin/sign-out-button";
import { StatusBadge } from "@/app/admin/packages/status-badge";
import { requireAdminPage } from "@/lib/admin-session";
import {
  maskTrackingNumber,
  packageSearchQueryString,
  parsePackageSearchParams,
  SHIPMENT_STATUS_OPTIONS,
  getStatusPresentation,
} from "@/lib/shipment-domain";
import {
  getShipmentDashboardStats,
  listCarrierFilters,
  listShipments,
} from "@/lib/shipments";

type AdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function formatDestination(city: string | null, country: string | null) {
  return [city, country].filter(Boolean).join(", ") || "Not provided";
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const session = await requireAdminPage("/admin");
  const filters = parsePackageSearchParams(await searchParams);
  const [stats, packageResult, carriers] = await Promise.all([
    getShipmentDashboardStats(),
    listShipments(filters),
    listCarrierFilters(),
  ]);

  const statisticCards = [
    ["Total packages", stats.total],
    ["Pending", stats.pending],
    ["In transit", stats.inTransit],
    ["Delivered", stats.delivered],
    ["Attention required", stats.attention],
  ] as const;

  return (
    <main className="admin-dashboard">
      <header className="admin-dashboard-header">
        <div>
          <p className="auth-kicker">Secure workspace</p>
          <h1>ParcelTrack Admin</h1>
          <p>Signed in as {session.user.name || session.user.email}</p>
        </div>
        <div className="dashboard-actions">
          <Link className="primary-link" href="/admin/packages/new">Create Package</Link>
          <SignOutButton />
        </div>
      </header>

      <section className="stats-grid" aria-label="Package statistics">
        {statisticCards.map(([label, value]) => (
          <article className="stat-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="package-list-panel" aria-labelledby="packages-title">
        <div className="panel-heading">
          <div>
            <h2 id="packages-title">Packages</h2>
            <p>{packageResult.total} package{packageResult.total === 1 ? "" : "s"} found</p>
          </div>
        </div>

        <form className="package-filters" method="get">
          <div>
            <label htmlFor="package-query">Search packages</label>
            <input id="package-query" name="query" defaultValue={filters.query} placeholder="Reference, recipient, or tracking number" />
          </div>
          <div>
            <label htmlFor="package-status">Status</label>
            <select id="package-status" name="status" defaultValue={filters.status ?? ""}>
              <option value="">All statuses</option>
              {SHIPMENT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>{getStatusPresentation(status).label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="package-carrier">Carrier</label>
            <select id="package-carrier" name="carrier" defaultValue={filters.carrier}>
              <option value="">All carriers</option>
              {carriers.map((carrier) => (
                <option key={carrier.carrierCode} value={carrier.carrierCode}>
                  {carrier.carrierName || carrier.carrierCode}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-actions">
            <button type="submit">Apply filters</button>
            <Link className="secondary-link" href="/admin">Clear filters</Link>
          </div>
        </form>

        {packageResult.shipments.length === 0 ? (
          <div className="package-empty">
            <h3>No packages found</h3>
            <p>Adjust the filters or create a new package to get started.</p>
          </div>
        ) : (
          <div className="package-table-wrap">
            <table className="package-table">
              <thead><tr><th>Reference</th><th>Recipient</th><th>Carrier</th><th>Tracking</th><th>Status</th><th>Destination</th><th>Last updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {packageResult.shipments.map((shipment) => (
                  <tr key={shipment.id}>
                    <td><strong>{shipment.reference}</strong></td>
                    <td>{shipment.recipientName || "Not provided"}</td>
                    <td>{shipment.carrierName || shipment.carrierCode || "Not connected"}</td>
                    <td><span className="tracking-mask">{maskTrackingNumber(shipment.trackingNumber)}</span></td>
                    <td><StatusBadge status={shipment.status} /></td>
                    <td>{formatDestination(shipment.destinationCity, shipment.destinationCountryCode)}</td>
                    <td>{shipment.updatedAt.toLocaleDateString("en", { dateStyle: "medium" })}</td>
                    <td><Link className="table-action" href={`/admin/packages/${shipment.id}`}>View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {packageResult.totalPages > 1 ? (
          <nav className="pagination" aria-label="Package pagination">
            {filters.page > 1 ? <Link href={`/admin${packageSearchQueryString(filters, filters.page - 1)}`}>Previous</Link> : <span />}
            <span>Page {filters.page} of {packageResult.totalPages}</span>
            {filters.page < packageResult.totalPages ? <Link href={`/admin${packageSearchQueryString(filters, filters.page + 1)}`}>Next</Link> : <span />}
          </nav>
        ) : null}
      </section>
    </main>
  );
}
