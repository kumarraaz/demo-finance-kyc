export const DEMO_BANNER =
  "DEMO ONLY: all verification is SIMULATED. No real KYC is performed, no real PAN or Aadhaar data may be entered, and no loan is approved or offered.";

// In production the cookie uses the __Host- prefix: browsers then require
// Secure, Path=/ and no Domain, so a sibling subdomain cannot overwrite it.
// The prefix cannot be used over plain http, so dev/test use a plain name.
export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-dfk_admin_session" : "dfk_admin_session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

// Login rate limits (shared via Postgres, see rate-limit.ts).
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_PER_IP = 5;
// Across all IPs. Protects the single admin account from distributed guessing.
export const LOGIN_MAX_GLOBAL = 30;
