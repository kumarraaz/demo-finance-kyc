import { DEMO_BANNER } from "@/lib/constants";

export function DemoBanner() {
  return (
    <div className="banner" role="note">
      <strong>SIMULATED DEMO.</strong> {DEMO_BANNER.replace(/^DEMO ONLY: /, "")}
    </div>
  );
}
