// Shown while a signed-in page loads its data (inside the shell, so navigation does not flash).
export default function Loading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="stack">
      <span className="sr-only">Loading...</span>
      <div className="skeleton skel-title" />
      <div className="kpis">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skeleton skel-kpi" />
        ))}
      </div>
      <div className="skeleton skel-block" />
    </div>
  );
}
