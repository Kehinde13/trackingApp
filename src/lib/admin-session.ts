import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { AdminAuthorizationError, assertAdminRole, hasAdminRole } from "@/lib/auth-guards";

export async function requireAdminForMutation() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new AdminAuthorizationError();
  assertAdminRole(session.user.role);
  return session;
}

export async function requireAdminPage(callbackUrl: string) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect(`/admin/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  if (!hasAdminRole(session.user.role)) {
    redirect("/admin/login?error=unauthorized");
  }

  return session;
}
