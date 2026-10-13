import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";
import { Icon } from "@/components/Icon";

export default function Home() {
  return (
    <main id="main" className="home" tabIndex={-1}>
      <div className="card home-card">
        <BrandMark />
        <h1>Merchant finance workspace (demo)</h1>
        <p className="muted">
          This is a prototype. Every verification step is <strong>simulated</strong>. It does not perform real KYC,
          does not accept real PAN or Aadhaar data, and never approves or offers a loan.
        </p>
        <div className="home-actions">
          <Link href="/apply" className="btn btn-primary">
            Start a demo application <Icon name="arrowRight" size={18} />
          </Link>
          <Link href="/admin" className="btn btn-secondary">Admin dashboard</Link>
          <span className="muted small">Admin login required</span>
        </div>
      </div>
    </main>
  );
}
