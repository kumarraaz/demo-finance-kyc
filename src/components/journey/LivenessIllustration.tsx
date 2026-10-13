// Neutral decorative illustration: a face outline inside a guide oval. Not a photo and not any real person.
export function LivenessIllustration() {
  return (
    <svg viewBox="0 0 240 200" width="100%" role="img" aria-label="Illustration: a face centred inside an oval guide" focusable="false">
      <rect width="240" height="200" rx="16" fill="#0D1B2A" />
      <ellipse cx="120" cy="100" rx="52" ry="68" fill="none" stroke="#D4AF37" strokeWidth="3" strokeDasharray="8 6" />
      <circle cx="120" cy="86" r="22" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M78 158c6-24 22-34 42-34s36 10 42 34" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function SilhouettePlaceholder() {
  return (
    <svg viewBox="0 0 120 160" width="70%" role="img" aria-label="Generic placeholder silhouette" focusable="false">
      <circle cx="60" cy="58" r="26" fill="#9aa7b6" />
      <path d="M14 150c4-34 24-50 46-50s42 16 46 50z" fill="#9aa7b6" />
    </svg>
  );
}
