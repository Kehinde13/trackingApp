import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/app/admin/login/login-form";
import { hasAdminRole, getSafeInternalCallbackUrl } from "@/lib/auth-guards";
import { auth } from "@/lib/auth";

type AdminLoginPageProps = {
  searchParams: Promise<{
    callbackUrl?: string | string[];
    error?: string | string[];
  }>;
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  const [session, params] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    searchParams,
  ]);

  if (session && hasAdminRole(session.user.role)) {
    redirect("/admin");
  }

  const callbackCandidate = Array.isArray(params.callbackUrl)
    ? params.callbackUrl[0]
    : params.callbackUrl;
  const denied = params.error === "unauthorized";

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <Link className="auth-brand" href="/" aria-label="ParcelTrack home">
          <span className="auth-brand-mark" aria-hidden="true">PT</span>
          <span>ParcelTrack</span>
        </Link>
        <p className="auth-kicker">Administrator portal</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="auth-intro">
          Sign in with your administrator credentials to manage ParcelTrack.
        </p>
        {denied ? (
          <p className="auth-alert" role="alert">
            Administrator access is required.
          </p>
        ) : null}
        <LoginForm callbackUrl={getSafeInternalCallbackUrl(callbackCandidate)} />
        <p className="auth-footnote">Private access for authorized staff only.</p>
      </section>
    </main>
  );
}
