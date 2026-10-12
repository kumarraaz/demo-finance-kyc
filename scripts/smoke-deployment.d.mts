export function checkSessionCookie(setCookie: string, opts: { https: boolean }): string[];
export function checkPageHeaders(get: (name: string) => string | null | undefined, opts: { https: boolean }): string[];
export function isVercelProtection(res: { status: number; get: (name: string) => string | null | undefined; setCookies?: string[] }): boolean;
export function protectionMessage(opts: { bypassSent: boolean }): string;
export function describeLoginFailure(status: number): string;
