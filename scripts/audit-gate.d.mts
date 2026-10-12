type Via = string | { url?: string; source?: number | string; title?: string };
type AuditReport = {
  vulnerabilities?: Record<string, { severity: string; via?: Via[] }>;
};
export const ACCEPTED: Record<string, string[]>;
export function evaluateAudit(
  full: AuditReport,
  prod: AuditReport,
  accepted?: Record<string, string[]>,
): { failures: string[]; notes: string[] };
