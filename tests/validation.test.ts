import { describe, expect, it } from "vitest";
import { changeStatusSchema, createApplicationSchema, listQuerySchema, looksLikeIdentityNumber } from "@/lib/validation";

const valid = {
  applicantName: "Asha Verma",
  email: "asha@example.com",
  loanProduct: "personal",
  requestedAmount: 50000,
  purpose: "Fictional test",
};

describe("identity number guard", () => {
  it.each(["ABCDE1234F", "abcde1234f", "pan is ABCDE1234F ok", "1234 5678 9012", "1234-5678-9012", "123456789012"])(
    "flags %s",
    (text) => expect(looksLikeIdentityNumber(text)).toBe(true),
  );
  it.each(["hello", "Order 12345", "1234 5678", "ABCD1234", "amount 100000"])("allows %s", (text) =>
    expect(looksLikeIdentityNumber(text)).toBe(false),
  );
});

describe("createApplicationSchema", () => {
  it("accepts a valid fictional application", () => {
    expect(createApplicationSchema.safeParse(valid).success).toBe(true);
  });
  it("defaults purpose to empty string", () => {
    const { purpose: _purpose, ...rest } = valid;
    void _purpose;
    const r = createApplicationSchema.safeParse(rest);
    expect(r.success && r.data.purpose).toBe("");
  });
  it("rejects PAN or Aadhaar in the purpose field", () => {
    expect(createApplicationSchema.safeParse({ ...valid, purpose: "PAN ABCDE1234F" }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ ...valid, purpose: "1234 5678 9012" }).success).toBe(false);
  });
  it("rejects bad names, emails, products and amounts", () => {
    for (const bad of [
      { applicantName: "A" },
      { applicantName: "Bob 123" },
      { email: "not-an-email" },
      { loanProduct: "crypto" },
      { requestedAmount: 999 },
      { requestedAmount: 10_000_001 },
      { requestedAmount: 1000.5 },
      { requestedAmount: "5000" },
    ]) {
      expect(createApplicationSchema.safeParse({ ...valid, ...bad }).success).toBe(false);
    }
  });
  it("trims whitespace", () => {
    const r = createApplicationSchema.safeParse({ ...valid, applicantName: "  Asha Verma  " });
    expect(r.success && r.data.applicantName).toBe("Asha Verma");
  });
});

describe("changeStatusSchema", () => {
  it("requires a note for failed, closed and more_info_needed", () => {
    for (const toStatus of ["more_info_needed", "simulated_check_failed", "closed"]) {
      expect(changeStatusSchema.safeParse({ toStatus }).success).toBe(false);
      expect(changeStatusSchema.safeParse({ toStatus, note: "because" }).success).toBe(true);
    }
  });
  it("does not require a note for in_review", () => {
    expect(changeStatusSchema.safeParse({ toStatus: "in_review" }).success).toBe(true);
  });
  it("rejects unknown statuses, including approval wording", () => {
    expect(changeStatusSchema.safeParse({ toStatus: "approved" }).success).toBe(false);
  });
  it("rejects identity numbers in notes", () => {
    expect(changeStatusSchema.safeParse({ toStatus: "in_review", note: "ABCDE1234F" }).success).toBe(false);
  });
});

describe("listQuerySchema", () => {
  it("applies defaults and coerces numbers", () => {
    expect(listQuerySchema.parse({ page: "2" })).toMatchObject({ page: 2, pageSize: 20 });
  });
  it("rejects out-of-range paging and unknown status", () => {
    expect(listQuerySchema.safeParse({ pageSize: "1000" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ page: "0" }).success).toBe(false);
    expect(listQuerySchema.safeParse({ status: "approved" }).success).toBe(false);
  });
});
