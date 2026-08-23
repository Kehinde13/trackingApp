"use client";

import Link from "next/link";

export default function PackagesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="admin-content-page"><section className="content-card error-card"><p className="auth-kicker">Unable to load</p><h1>Package information is unavailable</h1><p>Something went wrong while loading this protected page. No package data was changed.</p><div className="package-form-actions"><button type="button" onClick={() => reset()}>Try again</button><Link className="secondary-link" href="/admin">Return to packages</Link></div></section></main>;
}
