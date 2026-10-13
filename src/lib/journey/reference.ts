// Application reference: "DFK-XXXXX-XXXXX", 50 random bits from the Web Crypto API.
// It is not derived from a phone number, PAN or any personal data, and is distinct from the
// admin records' "DEMO-000123" references.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32: no I, L, O, U
export const REFERENCE_PATTERN = /^DFK-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

export type RandomBytes = (n: number) => Uint8Array;

const webCryptoBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function generateReference(random: RandomBytes = webCryptoBytes, exists: (ref: string) => boolean = () => false): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = random(10);
    let out = "";
    for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] & 31];
    const ref = `DFK-${out.slice(0, 5)}-${out.slice(5)}`;
    if (!exists(ref)) return ref;
  }
  throw new Error("Could not generate a unique reference");
}
