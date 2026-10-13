// Original wordmark for the customer journey: a gold tile with a navy "D" and a gold bar. Not modelled on any lender.
export function CjBrand({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <span className={`cj-brand cj-brand-${tone}`}>
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="8" fill="#D4AF37" />
        <path d="M10 22V10h5.5a6 6 0 0 1 0 12z" fill="none" stroke="#0D1B2A" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M21 11.5v9" stroke="#0D1B2A" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="cj-brand-word">Demo<span>Finance</span></span>
    </span>
  );
}
