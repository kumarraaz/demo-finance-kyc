import { describe, expect, it } from "vitest";
import { createEmptyDraft } from "@/lib/journey/draft";
import { ageOn, hasErrors, isValidPan, normalizePan, parseIsoDate, validateAddress, validateAsset, validateBasic, validatePersonal } from "@/lib/journey/validation";
import { completeDraft, TODAY } from "./helpers/journey-fixtures";

const basic = { mobile: "9000000001", dob: "1990-05-15", panName: "Test Applicant", fictionalConfirmed: true, panRaw: "ABCPE1234F" };

describe("PAN, dates and ages", () => {
  it("normalises and validates PAN format including the holder-type letter", () => {
    expect(normalizePan(" abcpe-1234f ")).toBe("ABCPE1234F");
    expect(isValidPan("ABCPE1234F")).toBe(true);
    expect(isValidPan("ABCDE1234F")).toBe(false); // 4th letter D is not a holder type
    expect(isValidPan("ABCPE12345")).toBe(false);
    expect(isValidPan("ABCP1234FE")).toBe(false);
    expect(isValidPan("abcpe1234f")).toBe(false); // must be normalised first
  });
  it("parses only real calendar dates", () => {
    expect(parseIsoDate("2000-02-29")).not.toBeNull();
    expect(parseIsoDate("2001-02-29")).toBeNull();
    expect(parseIsoDate("2000-13-01")).toBeNull();
    expect(parseIsoDate("15/05/1990")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });
  it("computes whole years, respecting the birthday", () => {
    const dob = parseIsoDate("2000-10-14")!;
    expect(ageOn(dob, new Date("2026-10-13T00:00:00Z"))).toBe(25);
    expect(ageOn(dob, new Date("2026-10-14T00:00:00Z"))).toBe(26);
  });
});

describe("validateBasic", () => {
  it("accepts a valid fictional record", () => {
    expect(validateBasic(basic, TODAY)).toEqual({});
  });
  it.each([
    ["", "required"], ["123456789", "10-digit"], ["5876543210", "starting with 6"], ["98765 43210", "10-digit"], ["98765432101", "10-digit"],
  ])("rejects mobile %j", (mobile, text) => {
    expect(validateBasic({ ...basic, mobile }, TODAY).mobile).toContain(text);
  });
  it("applies the age bounds on both sides", () => {
    expect(validateBasic({ ...basic, dob: "2010-01-01" }, TODAY).dob).toContain("at least 18");
    expect(validateBasic({ ...basic, dob: "2008-10-14" }, TODAY).dob).toContain("at least 18"); // turns 18 tomorrow
    expect(validateBasic({ ...basic, dob: "2008-10-13" }, TODAY).dob).toBeUndefined(); // turns 18 today
    expect(validateBasic({ ...basic, dob: "1950-01-01" }, TODAY).dob).toContain("70");
    expect(validateBasic({ ...basic, dob: "2999-01-01" }, TODAY).dob).toContain("future");
    expect(validateBasic({ ...basic, dob: "1990-02-31" }, TODAY).dob).toContain("valid");
    expect(validateBasic({ ...basic, dob: "" }, TODAY).dob).toContain("required");
  });
  it("requires a PAN: typed and well-formed, or an already-masked valid one", () => {
    expect(validateBasic({ ...basic, panRaw: "" }, TODAY).pan).toContain("required");
    expect(validateBasic({ ...basic, panRaw: "ABCDE1234F" }, TODAY).pan).toContain("format");
    expect(validateBasic({ ...basic, panRaw: "", panMasked: "AB******4F", panFormatValid: true }, TODAY)).toEqual({});
    expect(validateBasic({ ...basic, panRaw: "", panMasked: "AB******4F", panFormatValid: false }, TODAY).pan).toBeDefined();
  });
  it("requires the fictional-data confirmation and a clean name", () => {
    expect(validateBasic({ ...basic, fictionalConfirmed: false }, TODAY).fictionalConfirmed).toBeDefined();
    expect(validateBasic({ ...basic, panName: "" }, TODAY).panName).toContain("required");
    expect(validateBasic({ ...basic, panName: "R2D2" }, TODAY).panName).toContain("letters");
    expect(validateBasic({ ...basic, panName: "A" }, TODAY).panName).toContain("short");
  });
});

describe("validatePersonal (required and conditional fields)", () => {
  it("accepts the complete fixture and starts with every required field flagged on an empty form", async () => {
    expect(validatePersonal((await completeDraft()).personal)).toEqual({});
    const empty = Object.keys(validatePersonal(createEmptyDraft("DFK-AAAAA-BBBBB").personal)).sort();
    expect(empty).toEqual(["employmentType", "fatherFirstName", "fatherLastName", "firstName", "lastName", "maritalStatus", "relation", "requestedAmount"].sort());
  });
  it("validates names, email and the loan amount range", async () => {
    const p = (await completeDraft()).personal;
    expect(validatePersonal({ ...p, firstName: "Asha1" }).firstName).toBeDefined();
    expect(validatePersonal({ ...p, middleName: "" }).middleName).toBeUndefined(); // optional
    expect(validatePersonal({ ...p, email: "" }).email).toBeUndefined(); // optional
    expect(validatePersonal({ ...p, email: "not-an-email" }).email).toBeDefined();
    expect(validatePersonal({ ...p, requestedAmount: 0 }).requestedAmount).toBeDefined();
    expect(validatePersonal({ ...p, requestedAmount: -5 }).requestedAmount).toContain("greater than zero");
    expect(validatePersonal({ ...p, requestedAmount: 9_999 }).requestedAmount).toContain("at least");
    expect(validatePersonal({ ...p, requestedAmount: 5_000_001 }).requestedAmount).toContain("at most");
    expect(validatePersonal({ ...p, requestedAmount: 1500.5 }).requestedAmount).toContain("whole number");
    expect(validatePersonal({ ...p, requestedAmount: null }).requestedAmount).toContain("required");
  });
  it("rejects identity-number-looking text in free text fields", async () => {
    const p = (await completeDraft()).personal;
    expect(validatePersonal({ ...p, employerName: "ABCDE1234F" }).employerName).toContain("PAN or Aadhaar");
    expect(validatePersonal({ ...p, employerName: "Works 1234 5678 9012" }).employerName).toContain("PAN or Aadhaar");
  });
  it("requires business fields only for self-employed, employer fields only for salaried", async () => {
    const p = (await completeDraft()).personal;
    const self = { ...p, employmentType: "self_employed" as const, businessName: "", employerName: "Ignored" };
    expect(Object.keys(validatePersonal(self)).sort()).toEqual(["businessName"]);
    expect(validatePersonal({ ...self, businessName: "Demo Traders" })).toEqual({});
    const salaried = { ...p, employerName: "", businessName: "Ignored" };
    expect(Object.keys(validatePersonal(salaried)).sort()).toEqual(["employerName"]);
    expect(validatePersonal({ ...p, monthlyIncome: null }).monthlyIncome).toContain("Monthly salary is required");
    expect(validatePersonal({ ...self, businessName: "X Co", monthlyIncome: null }).monthlyIncome).toContain("Monthly income is required");
    expect(validatePersonal({ ...p, monthlyIncome: 0 }).monthlyIncome).toBeDefined();
  });
  it("treats employment duration as optional but checks it when given", async () => {
    const p = (await completeDraft()).personal;
    expect(validatePersonal({ ...p, employmentDurationMonths: null }).employmentDurationMonths).toBeUndefined();
    expect(validatePersonal({ ...p, employmentDurationMonths: -1 }).employmentDurationMonths).toBeDefined();
    expect(validatePersonal({ ...p, employmentDurationMonths: 601 }).employmentDurationMonths).toBeDefined();
  });
});

describe("validateAddress", () => {
  it("accepts the fixture and requires both Yes/No answers", async () => {
    const a = (await completeDraft()).address;
    expect(validateAddress(a)).toEqual({});
    expect(validateAddress({ ...a, matchesDocument: "" }).matchesDocument).toBeDefined();
    expect(validateAddress({ ...a, deliverySame: "" }).deliverySame).toBeDefined();
  });
  it("validates PIN, state and country", async () => {
    const a = (await completeDraft()).address;
    for (const pin of ["", "12345", "0123456", "41100a", "4110011"]) expect(validateAddress({ ...a, pin }).pin).toBeDefined();
    expect(validateAddress({ ...a, state: "Atlantis" }).state).toBeDefined();
    expect(validateAddress({ ...a, country: "France" }).country).toBeDefined();
    expect(validateAddress({ ...a, line1: "" }).line1).toBeDefined();
    expect(validateAddress({ ...a, landmark: "" })).toEqual({}); // optional
  });
  it("validates the delivery address only when 'No' is selected", async () => {
    const a = (await completeDraft()).address;
    expect(validateAddress({ ...a, deliverySame: "yes" })).toEqual({}); // empty delivery ignored
    const errs = validateAddress({ ...a, deliverySame: "no" });
    expect(Object.keys(errs).sort()).toEqual(["delivery.city", "delivery.line1", "delivery.pin", "delivery.state"]);
    expect(validateAddress({ ...a, deliverySame: "no", delivery: { line1: "5 Other Road", line2: "", landmark: "", city: "Mumbai", state: "Maharashtra", pin: "400001", country: "India" } })).toEqual({});
  });
  it("does not reject a different document address: that is a review state, not an error", async () => {
    const a = (await completeDraft()).address;
    expect(hasErrors(validateAddress({ ...a, matchesDocument: "no" }))).toBe(false);
  });
});

describe("validateAsset", () => {
  it("requires every level and both explicit Yes/No answers", () => {
    const e = validateAsset(createEmptyDraft("DFK-AAAAA-BBBBB").asset);
    expect(Object.keys(e).sort()).toEqual(["manufacturer", "model", "productType", "stepUp", "suspectedActivity", "variant"]);
  });
  it("rejects an inconsistent combination", async () => {
    const a = (await completeDraft()).asset;
    expect(validateAsset(a)).toEqual({});
    expect(validateAsset({ ...a, manufacturer: "cedar-home" }).variant).toContain("not in the catalog");
  });
});
