// The one captured selfie lives only in this page session's memory: never in browser storage, never uploaded, and the
// object URL is revoked on retake, on leaving the flow, or when the tab closes.
//
// "The person pressed Start" has to survive a full page load (the camera screen is opened with a real navigation, see
// openCameraScreen), so it is a timestamp in sessionStorage. It is consumed on use and expires after 20 seconds, so a later
// visit, a reload or a typed URL never starts the camera by itself.

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const START_KEY = "dfk.liveness.startRequestedAt";
export const START_TTL_MS = 20_000;

function tabStorage(): SessionStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Record that the person just pressed a button that starts the camera flow. */
export function requestStart(now: number = Date.now(), store: SessionStore | null = tabStorage()) {
  try {
    store?.setItem(START_KEY, String(now));
  } catch {
    /* storage blocked: the person will press "Start camera" on the next screen */
  }
}

/** True once, and only within the TTL of the press. Always clears the flag. */
export function consumeStart(now: number = Date.now(), store: SessionStore | null = tabStorage()): boolean {
  if (!store) return false;
  let at = NaN;
  try {
    at = Number(store.getItem(START_KEY));
    store.removeItem(START_KEY);
  } catch {
    return false;
  }
  return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at <= START_TTL_MS;
}

let imageUrl: string | null = null;

export function getImageUrl(): string | null {
  return imageUrl;
}

export function setImageUrl(url: string | null) {
  if (imageUrl && imageUrl !== url) URL.revokeObjectURL(imageUrl);
  imageUrl = url;
}

export function clearSession(store: SessionStore | null = tabStorage()) {
  try {
    store?.removeItem(START_KEY);
  } catch {
    /* nothing to clear */
  }
  setImageUrl(null);
}

/**
 * Open the camera screen with a REAL page load. Browsers apply Permissions-Policy per document, and only this screen's
 * response allows the camera, so an in-app (client-side) navigation would keep the previous page's policy and the camera
 * would be blocked. `userStarted` marks that the person just pressed Start or Retake.
 */
export function openCameraScreen(userStarted: boolean) {
  if (userStarted) requestStart();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- a real page load is the whole point here
  window.location.assign("/apply/liveness/capture");
}
