import Link from "next/link";

import { createPackageAction } from "@/app/admin/packages/actions";
import { INITIAL_PACKAGE_FORM_STATE } from "@/app/admin/packages/form-state";
import { PackageForm } from "@/app/admin/packages/package-form";
import { requireAdminPage } from "@/lib/admin-session";

export default async function NewPackagePage() {
  await requireAdminPage("/admin/packages/new");

  return (
    <main className="admin-content-page">
      <div className="content-breadcrumbs"><Link href="/admin">Packages</Link><span>/</span><span>New package</span></div>
      <header className="content-header">
        <div><p className="auth-kicker">Package setup</p><h1>Create a package</h1><p>Add shipment metadata. Status updates will be managed separately.</p></div>
      </header>
      <section className="content-card">
        <PackageForm action={createPackageAction} initialState={INITIAL_PACKAGE_FORM_STATE} cancelHref="/admin" mode="create" />
      </section>
    </main>
  );
}
