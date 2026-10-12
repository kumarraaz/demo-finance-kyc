export const EXPECTED_ENDPOINT_VAR: "EXPECTED_DB_ENDPOINT";
export function describeDbHost(url: string): { host: string; endpointId: string; pooled: boolean } | null;
export function migrationTargetBlockers(env: Record<string, string | undefined>): string[];
export function targetVerificationBlockers(env: Record<string, string | undefined>): string[];
export function buildTargetBlockers(env: Record<string, string | undefined>): string[];
