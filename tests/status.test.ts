import { describe, expect, it } from "vitest";
import { STATUSES, STATUS_LABELS, TRANSITIONS, canTransition, isSimulatedStatus } from "@/lib/status";

describe("status model", () => {
  it("has a label and transition entry for every status", () => {
    for (const s of STATUSES) {
      expect(STATUS_LABELS[s]).toBeTruthy();
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });
  it("closed is terminal", () => {
    expect(TRANSITIONS.closed).toHaveLength(0);
  });
  it("blocks skipping review", () => {
    expect(canTransition("submitted", "simulated_check_passed")).toBe(false);
    expect(canTransition("submitted", "in_review")).toBe(true);
  });
  it("labels every simulated outcome as demo/simulated", () => {
    for (const s of STATUSES.filter(isSimulatedStatus)) expect(STATUS_LABELS[s].toLowerCase()).toContain("simulated");
  });
  it("never uses approval or rejection wording", () => {
    for (const s of STATUSES) expect(`${s} ${STATUS_LABELS[s]}`).not.toMatch(/approv|reject|sanction|disburs/i);
  });
});
