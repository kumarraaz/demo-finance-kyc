// Content-Security-Policy builder. A fresh nonce is generated per request in the proxy.
export function buildCsp(nonce: string, isDev = process.env.NODE_ENV === "development"): string {
  const directives = [
    "default-src 'self'",
    // 'strict-dynamic' lets nonce-approved scripts load their own chunks; host allow-lists are ignored by modern browsers then.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ];
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
