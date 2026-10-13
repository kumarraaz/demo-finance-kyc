import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

// Replaces Next's built-in 404 page, which uses inline style attributes that this site's CSP blocks.
export default function NotFound() {
  return (
    <main id="main" className="home" tabIndex={-1}>
      <div className="card home-card">
        <BrandMark />
        <h1>Page not found</h1>
        <p className="muted">This page could not be found. It may have moved, or the address may be mistyped.</p>
        <div className="home-actions">
          <Link href="/" className="btn btn-primary">Go to the home page</Link>
          <Link href="/apply" className="btn btn-secondary">Start a demo application</Link>
        </div>
      </div>
    </main>
  );
}
