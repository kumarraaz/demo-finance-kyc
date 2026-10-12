export const DIRECT_URL_VARS: readonly ["DIRECT_URL", "DATABASE_URL_UNPOOLED"];
export function resolveDirectUrl(env: Record<string, string | undefined>): { name: string; value: string } | null;
export function resolveMigrationUrl(
  env: Record<string, string | undefined>,
): { name: string; value: string; direct: boolean } | null;
