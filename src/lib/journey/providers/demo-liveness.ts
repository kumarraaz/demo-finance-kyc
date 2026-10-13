import { DEFAULT_RULES, type JourneyRules } from "../rules";
import type { LivenessProvider, LivenessResult } from "./types";

/**
 * DEMO liveness adapter. It never receives, stores or compares a face image. The result comes from a fixed fixture
 * (rules.livenessFixture) and its score is a constant that the UI always labels DEMO.
 */
export function createDemoLivenessProvider(rules: JourneyRules = DEFAULT_RULES, now: () => Date = () => new Date()): LivenessProvider {
  const sessions = new Set<string>();
  return {
    meta: { id: "liveness-demo", name: "Demo liveness (no biometric processing)", mode: "demo" },
    async startSession(reference) {
      const sessionId = `demo-${reference}-${Math.floor(now().getTime() / 1000)}`;
      sessions.add(sessionId);
      return { sessionId, mode: "demo" };
    },
    async submitCapture({ sessionId }) {
      if (!sessions.has(sessionId)) throw new Error("Unknown liveness session");
    },
    async getResult(sessionId): Promise<LivenessResult> {
      if (!sessions.has(sessionId)) throw new Error("Unknown liveness session");
      const outcome = rules.livenessFixture === "pass" ? "demo_passed" : rules.livenessFixture === "review" ? "demo_review" : "demo_failed";
      return { outcome, demoScorePct: rules.livenessDemoScorePct, completedAt: now().toISOString() };
    },
  };
}
