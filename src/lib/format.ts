// Display helpers. Pure and deterministic (fixed locale and time zone) so server and tests agree.

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

/** 1500000 -> "₹15,00,000" (Indian digit grouping). */
export function formatInr(amount: number): string {
  return inr.format(amount);
}

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

const dateOnly = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** ISO timestamp -> "12 Oct 2026, 17:34 UTC". Returns "-" for anything unparseable. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : `${dateTime.format(d)} UTC`;
}

/** ISO timestamp -> "12 Oct 2026". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : dateOnly.format(d);
}

/** "personal" -> "Personal loan" etc. Unknown values are shown as stored. */
export function formatProduct(product: string): string {
  switch (product) {
    case "personal":
      return "Personal loan";
    case "education":
      return "Education loan";
    case "home":
      return "Home loan";
    default:
      return product;
  }
}

/** Letters for the avatar: "kumarraaz" -> "K". */
export function initialOf(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : "?";
}
