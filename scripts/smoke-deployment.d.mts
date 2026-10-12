export function checkSessionCookie(setCookie: string, opts: { https: boolean }): string[];
export function checkPageHeaders(get: (name: string) => string | null | undefined, opts: { https: boolean }): string[];
