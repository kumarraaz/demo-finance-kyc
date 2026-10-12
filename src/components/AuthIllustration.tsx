// Decorative only: abstract shapes (a document card, five connected stages, soft rings). It shows no numbers,
// no results and no logos, so it cannot be mistaken for real verification data.
export function AuthIllustration() {
  return (
    <svg className="illus" viewBox="0 0 520 280" fill="none" aria-hidden="true" focusable="false">
      <circle cx="410" cy="96" r="94" stroke="#fff" strokeOpacity=".07" strokeWidth="1.5" />
      <circle cx="410" cy="96" r="62" stroke="#fff" strokeOpacity=".09" strokeWidth="1.5" />
      <circle cx="410" cy="96" r="30" stroke="#fff" strokeOpacity=".12" strokeWidth="1.5" />

      <rect x="24" y="24" width="248" height="150" rx="16" fill="#fff" fillOpacity=".08" stroke="#fff" strokeOpacity=".18" />
      <rect x="44" y="46" width="36" height="36" rx="10" fill="#5eead4" fillOpacity=".9" />
      <rect x="92" y="50" width="110" height="9" rx="4.5" fill="#fff" fillOpacity=".55" />
      <rect x="92" y="68" width="70" height="8" rx="4" fill="#fff" fillOpacity=".28" />
      <rect x="44" y="104" width="208" height="8" rx="4" fill="#fff" fillOpacity=".2" />
      <rect x="44" y="124" width="170" height="8" rx="4" fill="#fff" fillOpacity=".2" />
      <rect x="44" y="144" width="120" height="8" rx="4" fill="#fff" fillOpacity=".2" />

      <rect x="196" y="116" width="248" height="140" rx="16" fill="#2563eb" fillOpacity=".28" stroke="#93b4ff" strokeOpacity=".45" />
      <rect x="216" y="138" width="90" height="9" rx="4.5" fill="#fff" fillOpacity=".6" />
      <rect x="216" y="158" width="180" height="8" rx="4" fill="#fff" fillOpacity=".25" />
      <rect x="216" y="176" width="140" height="8" rx="4" fill="#fff" fillOpacity=".25" />

      <path d="M222 232h40M276 232h40M330 232h40M384 232h26" stroke="#fff" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
      <circle cx="216" cy="232" r="6" fill="#5eead4" />
      <circle cx="270" cy="232" r="6" fill="#fff" fillOpacity=".4" />
      <circle cx="324" cy="232" r="6" fill="#fff" fillOpacity=".4" />
      <circle cx="378" cy="232" r="6" fill="#fff" fillOpacity=".4" />
      <circle cx="432" cy="232" r="6" fill="#fff" fillOpacity=".4" />
    </svg>
  );
}
