// Camera access helpers. Nothing here runs until a screen calls it from a user action.

export type CameraProblem = "unsupported" | "insecure" | "policy" | "denied" | "not_found" | "in_use" | "unknown";

export const CAMERA_PROBLEM_TEXT: Record<CameraProblem, { title: string; body: string }> = {
  unsupported: { title: "Camera not supported", body: "This browser or device does not offer camera access to web pages." },
  insecure: { title: "Camera blocked on this page", body: "Browsers only allow the camera on secure (https) pages." },
  policy: { title: "Reload to use the camera", body: "The browser decides camera rules when a page loads. Reload this page, then press Start camera." },
  denied: { title: "Camera permission was denied", body: "Allow camera access for this site in your browser settings, then try again." },
  not_found: { title: "No camera found", body: "We could not find a camera on this device." },
  in_use: { title: "Camera is busy", body: "Another app or tab may be using the camera. Close it and try again." },
  unknown: { title: "The camera could not start", body: "Something went wrong while starting the camera." },
};

/** Map a getUserMedia failure to something a person can act on. Never exposes the raw error text. */
export function classifyCameraError(e: unknown): CameraProblem {
  const name = typeof e === "object" && e !== null && "name" in e ? String((e as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "not_found";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "in_use";
    case "SecurityError":
      return "insecure";
    case "TypeError":
      return "unsupported";
    default:
      return "unknown";
  }
}

/** False when the page's Permissions-Policy blocks the camera (it was reached without a fresh page load). */
export function cameraAllowedByPolicy(doc: { permissionsPolicy?: { allowsFeature: (f: string) => boolean }; featurePolicy?: { allowsFeature: (f: string) => boolean } } | undefined = typeof document === "undefined" ? undefined : (document as never)): boolean {
  const policy = doc?.permissionsPolicy ?? doc?.featurePolicy;
  if (!policy) return true; // browsers without the API: let getUserMedia decide
  try {
    return policy.allowsFeature("camera");
  } catch {
    return true;
  }
}

export type MediaApi = { mediaDevices?: { getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream> } };

export function cameraSupported(nav: MediaApi | undefined = typeof navigator === "undefined" ? undefined : (navigator as unknown as MediaApi)): boolean {
  return typeof nav?.mediaDevices?.getUserMedia === "function";
}

/** Front camera on phones, no audio. Throws the browser's own error; callers classify it. */
export async function openFrontCamera(nav: MediaApi = navigator as unknown as MediaApi): Promise<MediaStream> {
  if (!cameraSupported(nav)) throw new TypeError("getUserMedia is not available");
  return nav.mediaDevices!.getUserMedia!({ video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } }, audio: false });
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop());
}
