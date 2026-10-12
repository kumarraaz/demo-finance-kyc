import { z } from "zod";
import { NOTE_REQUIRED, STATUSES } from "./status";

export const LOAN_PRODUCTS = ["personal", "education", "home"] as const;

// This prototype must never hold real identity numbers. These patterns are a
// guard rail, not a verifier: any text that looks like a PAN or Aadhaar number
// is rejected before it can reach the database.
const PAN_PATTERN = /(?<![A-Za-z0-9])[A-Za-z]{5}\d{4}[A-Za-z](?![A-Za-z0-9])/;
const AADHAAR_PATTERN = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/;

export function looksLikeIdentityNumber(text: string): boolean {
  return PAN_PATTERN.test(text) || AADHAAR_PATTERN.test(text);
}

const SENSITIVE_MESSAGE =
  "Looks like a PAN or Aadhaar number. This demo must not store real identity data.";

const safeText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((v) => !looksLikeIdentityNumber(v), { message: SENSITIVE_MESSAGE });

export const createApplicationSchema = z.object({
  applicantName: safeText(100)
    .min(2, "Name must be at least 2 characters")
    .regex(/^[\p{L}][\p{L}\s.'-]*$/u, "Name may contain letters, spaces, . ' and - only"),
  email: safeText(254).pipe(z.email("Enter a valid email address")),
  loanProduct: z.enum(LOAN_PRODUCTS),
  requestedAmount: z
    .number({ error: "Amount must be a number" })
    .int("Amount must be a whole number")
    .min(1000, "Minimum demo amount is 1,000")
    .max(10_000_000, "Maximum demo amount is 10,000,000"),
  purpose: safeText(200).optional().default(""),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

export const changeStatusSchema = z
  .object({
    toStatus: z.enum(STATUSES),
    note: safeText(500).optional().default(""),
  })
  .superRefine((value, ctx) => {
    if ((NOTE_REQUIRED as readonly string[]).includes(value.toStatus) && value.note.length < 3) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "A note is required for this status" });
    }
  });

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

export function flattenIssues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
