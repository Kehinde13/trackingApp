import Link from "next/link";

export default function PackageNotFound() {
  return <main className="admin-content-page"><section className="content-card error-card"><p className="auth-kicker">Not found</p><h1>Package not found</h1><p>This package may not exist or may no longer be available.</p><Link className="primary-link" href="/admin">Return to packages</Link></section></main>;
}
