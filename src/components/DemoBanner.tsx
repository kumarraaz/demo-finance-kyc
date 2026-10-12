import { DEMO_BANNER } from "@/lib/constants";

// "DEMO ONLY: all verification ..." -> "All verification ..." (the lead-in is replaced by a bold label).
const BANNER_TEXT = DEMO_BANNER.replace(/^DEMO ONLY: /, "").replace(/^./, (c) => c.toUpperCase());
import { Icon } from "./Icon";

export function DemoBanner() {
  return (
    <div className="banner" role="note">
      <Icon name="info" size={16} />
      <span>
        <strong>SIMULATED DEMO.</strong> {BANNER_TEXT}
      </span>
    </div>
  );
}
