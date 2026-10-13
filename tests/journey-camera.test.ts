import { describe, expect, it } from "vitest";
import { CAMERA_PROBLEM_TEXT, cameraAllowedByPolicy, cameraSupported, classifyCameraError, openFrontCamera, stopStream } from "@/lib/journey/camera";
import { consumeStart, requestStart, START_TTL_MS } from "@/lib/journey/liveness-session";

class Store {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}
const err = (name: string) => Object.assign(new Error("x"), { name });

describe("camera error handling", () => {
  it.each([
    ["NotAllowedError", "denied"], ["PermissionDeniedError", "denied"], ["NotFoundError", "not_found"], ["DevicesNotFoundError", "not_found"],
    ["OverconstrainedError", "not_found"], ["NotReadableError", "in_use"], ["TrackStartError", "in_use"], ["AbortError", "in_use"],
    ["SecurityError", "insecure"], ["TypeError", "unsupported"], ["WeirdError", "unknown"],
  ] as const)("maps %s to %s", (name, problem) => {
    expect(classifyCameraError(err(name))).toBe(problem);
  });
  it("copes with non-error values and never exposes raw error text", () => {
    expect(classifyCameraError(undefined)).toBe("unknown");
    expect(classifyCameraError("boom")).toBe("unknown");
    expect(classifyCameraError(null)).toBe("unknown");
    for (const t of Object.values(CAMERA_PROBLEM_TEXT)) expect(`${t.title} ${t.body}`).not.toMatch(/Error|exception|stack|undefined/i);
  });
  it("has a message for every problem, including the policy case", () => {
    expect(CAMERA_PROBLEM_TEXT.policy.title).toContain("Reload");
    expect(Object.keys(CAMERA_PROBLEM_TEXT).sort()).toEqual(["denied", "in_use", "insecure", "not_found", "policy", "unknown", "unsupported"]);
  });
  it("detects missing camera support", () => {
    expect(cameraSupported(undefined)).toBe(false);
    expect(cameraSupported({})).toBe(false);
    expect(cameraSupported({ mediaDevices: {} })).toBe(false);
    expect(cameraSupported({ mediaDevices: { getUserMedia: async () => ({}) as MediaStream } })).toBe(true);
  });
  it("asks for the front camera without audio, and only when called", async () => {
    let asked: MediaStreamConstraints | null = null;
    const api = { mediaDevices: { getUserMedia: async (c: MediaStreamConstraints) => { asked = c; return {} as MediaStream; } } };
    expect(asked).toBeNull();
    await openFrontCamera(api);
    expect(asked).toMatchObject({ audio: false, video: { facingMode: "user" } });
    await expect(openFrontCamera({})).rejects.toBeInstanceOf(TypeError);
  });
  it("stops every track", () => {
    const stopped: string[] = [];
    const stream = { getTracks: () => ["a", "b"].map((id) => ({ stop: () => stopped.push(id) })) } as unknown as MediaStream;
    stopStream(stream);
    stopStream(null);
    expect(stopped).toEqual(["a", "b"]);
  });
  it("reads the page's Permissions-Policy for the camera", () => {
    expect(cameraAllowedByPolicy({ permissionsPolicy: { allowsFeature: () => false } })).toBe(false);
    expect(cameraAllowedByPolicy({ permissionsPolicy: { allowsFeature: (f) => f === "camera" } })).toBe(true);
    expect(cameraAllowedByPolicy({ featurePolicy: { allowsFeature: () => false } })).toBe(false);
    expect(cameraAllowedByPolicy({})).toBe(true); // API missing: let the browser decide
    expect(cameraAllowedByPolicy({ permissionsPolicy: { allowsFeature: () => { throw new Error("x"); } } })).toBe(true);
  });
});

describe("'person pressed Start' flag", () => {
  it("is honoured once, within the time limit", () => {
    const s = new Store();
    requestStart(1_000, s);
    expect(consumeStart(1_000 + 5_000, s)).toBe(true);
    expect(consumeStart(1_000 + 5_000, s)).toBe(false); // consumed
  });
  it("expires, so a later visit or typed URL never starts the camera", () => {
    const s = new Store();
    requestStart(1_000, s);
    expect(consumeStart(1_000 + START_TTL_MS + 1, s)).toBe(false);
    expect(s.m.size).toBe(0); // and it is cleared either way
  });
  it("is false with nothing recorded, garbage, a future time, or no storage", () => {
    const s = new Store();
    expect(consumeStart(5_000, s)).toBe(false);
    s.setItem("dfk.liveness.startRequestedAt", "abc");
    expect(consumeStart(5_000, s)).toBe(false);
    s.setItem("dfk.liveness.startRequestedAt", "999999");
    expect(consumeStart(5_000, s)).toBe(false);
    expect(consumeStart(5_000, null)).toBe(false);
    expect(() => requestStart(1, null)).not.toThrow();
  });
  it("survives blocked storage", () => {
    const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
    expect(() => requestStart(1, bad)).not.toThrow();
    expect(consumeStart(2, bad)).toBe(false);
  });
});
