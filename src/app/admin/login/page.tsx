import { AuthIllustration } from "@/components/AuthIllustration";
import { BrandMark } from "@/components/BrandMark";
import { Icon } from "@/components/Icon";
import { LoginForm } from "@/components/LoginForm";

const BENEFITS = [
  { icon: "list", text: "Application tracking" },
  { icon: "workflow", text: "Structured verification workflow" },
  { icon: "shield", text: "Secure application management" },
] as const;

export default function LoginPage() {
  return (
    <div className="auth">
      <section className="auth-brand on-dark" aria-label="About Demo Finance">
        <BrandMark tone="light" />
        <div className="brand-copy">
          <h2>Merchant Finance Workspace</h2>
          <p>Manage customer finance applications with clarity and confidence.</p>
          <ul className="benefits">
            {BENEFITS.map((b) => (
              <li key={b.text}>
                <span className="benefit-icon"><Icon name={b.icon} size={18} /></span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>
        <AuthIllustration />
      </section>

      <main id="main" className="auth-panel" tabIndex={-1}>
        <div className="auth-mobile-brand">
          <BrandMark />
          <span className="chip chip-demo">Demo only</span>
        </div>
        <div className="card auth-card">
          <h1>Welcome back</h1>
          <p className="auth-sub">Sign in to manage your finance applications.</p>
          <LoginForm />
          <p className="reassure">
            <Icon name="shield" size={18} />
            <span>
              Sign-in attempts are rate limited and sessions use HttpOnly cookies. This demo holds fictional data only.
            </span>
          </p>
        </div>
        <p className="auth-foot">Demo Finance &middot; Simulated demo &middot; No real KYC or loan decisions</p>
      </main>
    </div>
  );
}
