import Link from "next/link";
import { notFound } from "next/navigation";

import { updatePackageAction } from "@/app/admin/packages/actions";
import type { PackageFormState } from "@/app/admin/packages/form-state";
import { PackageForm } from "@/app/admin/packages/package-form";
import { requireAdminPage } from "@/lib/admin-session";
import { getShipmentDetails } from "@/lib/shipments";

type EditPackagePageProps = { params: Promise<{ id: string }> };

export default async function EditPackagePage({ params }: EditPackagePageProps) {
  const { id } = await params;
  await requireAdminPage(`/admin/packages/${id}/edit`);
  const shipment = await getShipmentDetails(id);
  if (!shipment) notFound();

  const initialState: PackageFormState = {
    message: "",
    fieldErrors: {},
    values: {
      reference: shipment.reference,
      recipientName: shipment.recipientName ?? "",
      carrierCode: shipment.carrierCode ?? "",
      carrierName: shipment.carrierName ?? "",
      trackingNumber: shipment.trackingNumber ?? "",
      originCity: shipment.originCity ?? "",
      originCountryCode: shipment.originCountryCode ?? "",
      destinationCity: shipment.destinationCity ?? "",
      destinationCountryCode: shipment.destinationCountryCode ?? "",
      estimatedDeliveryAt: shipment.estimatedDeliveryAt?.toISOString().slice(0, 10) ?? "",
    },
  };
  const action = updatePackageAction.bind(null, shipment.id);

  return (
    <main className="admin-content-page">
      <div className="content-breadcrumbs"><Link href="/admin">Packages</Link><span>/</span><Link href={`/admin/packages/${shipment.id}`}>{shipment.reference}</Link><span>/</span><span>Edit</span></div>
      <header className="content-header"><div><p className="auth-kicker">Package metadata</p><h1>Edit {shipment.reference}</h1><p>Status and tracking history cannot be changed from this form.</p></div></header>
      <section className="content-card"><PackageForm action={action} initialState={initialState} cancelHref={`/admin/packages/${shipment.id}`} mode="edit" /></section>
    </main>
  );
}
