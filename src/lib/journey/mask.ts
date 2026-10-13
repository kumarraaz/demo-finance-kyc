// Masking helpers. Anything shown outside the field the user is typing in goes through these.

/** "ABCDE1234F" -> "AB******4F". Anything that is not a 10-character PAN is fully masked. */
export function maskPan(pan: string): string {
  const p = pan.trim().toUpperCase();
  if (p.length !== 10) return "*".repeat(Math.min(p.length, 10));
  return `${p.slice(0, 2)}${"*".repeat(6)}${p.slice(8)}`;
}

/** "9876543210" -> "******3210". */
export function maskMobile(mobile: string): string {
  const d = mobile.replace(/\D/g, "");
  if (d.length < 4) return "*".repeat(d.length);
  return `${"*".repeat(d.length - 4)}${d.slice(-4)}`;
}

/** "Asha Verma" -> "Asha V." (admin tables never show full names). */
export function maskName(first: string, last: string): string {
  const f = first.trim();
  const l = last.trim();
  if (!f && !l) return "-";
  return `${f}${l ? ` ${l.charAt(0).toUpperCase()}.` : ""}`.trim();
}

/** "asha@example.com" -> "a***@example.com". */
export function maskEmail(email: string): string {
  const [user, domain] = email.trim().split("@");
  if (!user || !domain) return "";
  return `${user.charAt(0)}***@${domain}`;
}
