import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatInr, formatProduct, initialOf } from "@/lib/format";

describe("formatInr", () => {
  it("uses Indian digit grouping with the rupee sign", () => {
    expect(formatInr(1000)).toBe("₹1,000");
    expect(formatInr(150000)).toBe("₹1,50,000");
    expect(formatInr(2500000)).toBe("₹25,00,000");
    expect(formatInr(10000000)).toBe("₹1,00,00,000");
  });
  it("never shows paise", () => {
    expect(formatInr(1234.56)).toBe("₹1,235");
  });
});

describe("dates", () => {
  it("formats in UTC and says so", () => {
    expect(formatDateTime("2026-10-12T17:34:05.000Z")).toBe("12 Oct 2026, 17:34 UTC");
    expect(formatDate("2026-10-12T23:59:59.000Z")).toBe("12 Oct 2026");
  });
  it("does not throw on junk", () => {
    expect(formatDateTime("not a date")).toBe("-");
    expect(formatDate("")).toBe("-");
  });
});

describe("labels", () => {
  it("names the demo loan products and passes unknown values through", () => {
    expect(formatProduct("personal")).toBe("Personal loan");
    expect(formatProduct("education")).toBe("Education loan");
    expect(formatProduct("home")).toBe("Home loan");
    expect(formatProduct("gold")).toBe("gold");
  });
  it("takes the avatar letter from the name", () => {
    expect(initialOf("kumarraaz")).toBe("K");
    expect(initialOf("  ")).toBe("?");
  });
});
