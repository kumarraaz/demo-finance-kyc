// Text-based wordmark with a small abstract mark. Original to this project; it does not imitate any lender.
export function BrandMark({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <span className={`brand brand-${tone}`}>
      <svg className="brand-glyph" width="30" height="30" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <rect width="32" height="32" rx="8" className="brand-glyph-bg" />
        <path d="M10 22V10h5.5a6 6 0 0 1 0 12z" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="M21 11.5v9" stroke="#5EEAD4" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="brand-word">
        Demo<span className="brand-word-accent">Finance</span>
      </span>
    </span>
  );
}
