export type EnvReport = { errors: string[]; warnings: string[]; ok: string[] };
export function checkEnv(
  env: Record<string, string | undefined>,
  target?: "local" | "preview" | "production",
): EnvReport;
export function formatReport(report: EnvReport): string;
