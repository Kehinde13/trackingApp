import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/app/admin/sign-out-button";
import { auth } from "@/lib/auth";
import { hasAdminRole } from "@/lib/auth-guards";

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/admin/login?callbackUrl=%2Fadmin");
  }

  if (!hasAdminRole(session.user.role)) {
    redirect("/admin/login?error=unauthorized");
  }

  return (
    <main className="admin-page">
      <section className="admin-panel" aria-labelledby="admin-title">
        <div>
          <p className="auth-kicker">Secure workspace</p>
          <h1 id="admin-title">ParcelTrack Admin</h1>
          <p className="admin-identity">
            Signed in as {session.user.name || session.user.email}
          </p>
        </div>
        <div className="admin-confirmation">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Admin access confirmed</strong>
            <p>Package management will be added next.</p>
          </div>
        </div>
        <SignOutButton />
      </section>
    </main>
  );
}
