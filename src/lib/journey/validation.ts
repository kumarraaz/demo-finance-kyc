import { looksLikeIdentityNumber } from "../validation";
import { getAssetDetail } from "./catalog";
import { DEFAULT_RULES, type JourneyRules } from "./rules";
import { INDIAN_STATES, MARITAL_STATUSES, RELATIONS } from "./states";
import type { AddressDetails, AddressFields, AssetSelection, BasicDetails, Errors, PersonalDetails } from "./types";

// Pure validators. Each returns a map of field name -> message; an empty map means valid.
// Messages are written for the person filling the form.

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
// The 4th character of a PAN encodes the holder type (P person, C company, ...).
const PAN_HOLDER_TYPES = "ABCFGHJLPT";
const NAME_PATTERN = /^[\p{L}][\p{L}\s.'-]*$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PIN_PATTERN = /^[1-9]\d{5}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizePan(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
}

export function isValidPan(pan: string): boolean {
  return PAN_PATTERN.test(pan) && PAN_HOLDER_TYPES.includes(pan[3]);
}

export function parseIsoDate(value: string): Date | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? date : null;
}

/** Whole years between a date of birth and `today` (both UTC dates). */
export function ageOn(dob: Date, today: Date): number {
  let age = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dob.getUTCMonth() || (today.getUTCMonth() === dob.getUTCMonth() && today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

const req = (v: string) => v.trim().length === 0;
const noIdentityNumbers = (v: string) => (looksLikeIdentityNumber(v) ? "This looks like a PAN or Aadhaar number. Do not enter real identity numbers here." : null);

function checkName(errors: Errors, key: string, value: string, label: string, opts: { required: boolean }) {
  const v = value.trim();
  if (!v) {
    if (opts.required) errors[key] = `${label} is required`;
    return;
  }
  if (v.length > 100) errors[key] = `${label} is too long (100 characters at most)`;
  else if (!NAME_PATTERN.test(v)) errors[key] = `${label} may contain letters, spaces, . ' and - only`;
  else {
    const sensitive = noIdentityNumbers(v);
    if (sensitive) errors[key] = sensitive;
  }
}

function checkAmount(errors: Errors, key: string, value: number | null, label: string, min: number, max: number) {
  if (value === null || value === undefined || Number.isNaN(value)) errors[key] = `${label} is required`;
  else if (!Number.isFinite(value) || !Number.isInteger(value)) errors[key] = `${label} must be a whole number of rupees`;
  else if (value <= 0) errors[key] = `${label} must be greater than zero`;
  else if (value < min) errors[key] = `${label} must be at least ₹${min.toLocaleString("en-IN")}`;
  else if (value > max) errors[key] = `${label} must be at most ₹${max.toLocaleString("en-IN")}`;
}

export type BasicInput = Pick<BasicDetails, "mobile" | "dob" | "panName" | "fictionalConfirmed"> & { panRaw?: string; panMasked?: string; panFormatValid?: boolean };

/** `panRaw` is what the user typed this session. When it is empty the stored masked value must be marked valid. */
export function validateBasic(v: BasicInput, today: Date = new Date(), rules: JourneyRules = DEFAULT_RULES): Errors {
  const e: Errors = {};
  if (req(v.mobile)) e.mobile = "Mobile number is required";
  else if (!rules.mobilePattern.test(v.mobile)) e.mobile = "Enter a 10-digit Indian mobile number starting with 6, 7, 8 or 9";

  if (req(v.dob)) e.dob = "Date of birth is required";
  else {
    const dob = parseIsoDate(v.dob);
    if (!dob) e.dob = "Enter a valid date of birth";
    else if (dob.getTime() > today.getTime()) e.dob = "Date of birth cannot be in the future";
    else {
      const age = ageOn(dob, today);
      if (age < rules.age.min) e.dob = `You must be at least ${rules.age.min} years old`;
      else if (age > rules.age.max) e.dob = `Applicants must be ${rules.age.max} years old or younger`;
    }
  }

  checkName(e, "panName", v.panName, "Name as per PAN", { required: true });
  if (!e.panName && v.panName.trim().length < 2) e.panName = "Name as per PAN is too short";

  const raw = normalizePan(v.panRaw ?? "");
  if (raw) {
    if (!isValidPan(raw)) e.pan = "Enter a valid PAN in the format ABCDE1234F";
  } else if (!(v.panMasked && v.panFormatValid)) {
    e.pan = "PAN is required";
  }

  if (!v.fictionalConfirmed) e.fictionalConfirmed = "Confirm that this is fictional test data";
  return e;
}

export function validatePersonal(v: PersonalDetails, rules: JourneyRules = DEFAULT_RULES): Errors {
  const e: Errors = {};
  checkName(e, "firstName", v.firstName, "First name", { required: true });
  checkName(e, "middleName", v.middleName, "Middle name", { required: false });
  checkName(e, "lastName", v.lastName, "Last name", { required: true });
  if (v.email.trim()) {
    if (v.email.length > 254 || !EMAIL_PATTERN.test(v.email.trim())) e.email = "Enter a valid email address";
  }
  checkAmount(e, "requestedAmount", v.requestedAmount, "Requested loan amount", rules.loan.min, rules.loan.max);
  if (!MARITAL_STATUSES.some((m) => m.value === v.maritalStatus)) e.maritalStatus = "Select a marital status";
  if (!RELATIONS.some((r) => r.value === v.relation)) e.relation = "Select a relationship";
  checkName(e, "fatherFirstName", v.fatherFirstName, "Father's first name", { required: true });
  checkName(e, "fatherMiddleName", v.fatherMiddleName, "Father's middle name", { required: false });
  checkName(e, "fatherLastName", v.fatherLastName, "Father's last name", { required: true });

  if (v.employmentType !== "self_employed" && v.employmentType !== "salaried") {
    e.employmentType = "Select your employment type";
  } else if (v.employmentType === "self_employed") {
    if (req(v.businessName)) e.businessName = "Business name is required";
    else if (v.businessName.trim().length > 150) e.businessName = "Business name is too long";
    else if (noIdentityNumbers(v.businessName)) e.businessName = noIdentityNumbers(v.businessName)!;
    checkAmount(e, "monthlyIncome", v.monthlyIncome, "Monthly income", rules.income.min, rules.income.max);
  } else {
    if (req(v.employerName)) e.employerName = "Employer or company name is required";
    else if (v.employerName.trim().length > 150) e.employerName = "Employer name is too long";
    else if (noIdentityNumbers(v.employerName)) e.employerName = noIdentityNumbers(v.employerName)!;
    checkAmount(e, "monthlyIncome", v.monthlyIncome, "Monthly salary", rules.income.min, rules.income.max);
    const d = v.employmentDurationMonths;
    if (d !== null && d !== undefined) {
      if (!Number.isInteger(d) || d < rules.employmentDurationMonths.min || d > rules.employmentDurationMonths.max) {
        e.employmentDurationMonths = `Employment duration must be a whole number of months from ${rules.employmentDurationMonths.min} to ${rules.employmentDurationMonths.max}`;
      }
    }
  }
  return e;
}

function validateAddressFields(a: AddressFields, prefix: string, e: Errors) {
  const k = (n: string) => (prefix ? `${prefix}.${n}` : n);
  if (req(a.line1)) e[k("line1")] = "Address line 1 is required";
  else if (a.line1.trim().length > 150) e[k("line1")] = "Address line 1 is too long";
  else if (noIdentityNumbers(a.line1)) e[k("line1")] = noIdentityNumbers(a.line1)!;
  for (const f of ["line2", "landmark"] as const) {
    if (a[f].trim().length > 150) e[k(f)] = "This line is too long";
    else if (noIdentityNumbers(a[f])) e[k(f)] = noIdentityNumbers(a[f])!;
  }
  if (req(a.city)) e[k("city")] = "City is required";
  else if (!NAME_PATTERN.test(a.city.trim()) || a.city.length > 80) e[k("city")] = "Enter a valid city name";
  if (!INDIAN_STATES.includes(a.state as (typeof INDIAN_STATES)[number])) e[k("state")] = "Select a state";
  if (req(a.pin)) e[k("pin")] = "PIN code is required";
  else if (!PIN_PATTERN.test(a.pin)) e[k("pin")] = "Enter a valid 6-digit PIN code";
  if (a.country.trim() !== "India") e[k("country")] = "Only India is supported in this demo";
}

export function validateAddress(v: AddressDetails): Errors {
  const e: Errors = {};
  validateAddressFields(v, "", e);
  if (v.matchesDocument !== "yes" && v.matchesDocument !== "no") e.matchesDocument = "Choose Yes or No";
  if (v.deliverySame !== "yes" && v.deliverySame !== "no") e.deliverySame = "Choose Yes or No";
  else if (v.deliverySame === "no") validateAddressFields(v.delivery, "delivery", e);
  return e;
}

export function validateAsset(v: AssetSelection): Errors {
  const e: Errors = {};
  if (!v.productType) e.productType = "Select a product type";
  if (!v.manufacturer) e.manufacturer = "Select a manufacturer";
  if (!v.model) e.model = "Select a model";
  if (!v.variant) e.variant = "Select a variant";
  if (!e.productType && !e.manufacturer && !e.model && !e.variant && !getAssetDetail(v)) {
    e.variant = "This combination is not in the catalog. Choose again.";
  }
  if (v.suspectedActivity !== "yes" && v.suspectedActivity !== "no") e.suspectedActivity = "Choose Yes or No";
  if (v.stepUp !== "yes" && v.stepUp !== "no") e.stepUp = "Choose Yes or No";
  return e;
}

export function hasErrors(e: Errors): boolean {
  return Object.keys(e).length > 0;
}
