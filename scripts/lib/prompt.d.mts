export function readStdin(): Promise<string>;
export function readSecret(prompt: string): Promise<string>;
export function readSecretTwice(first: string, second: string, read?: (prompt: string) => Promise<string>): Promise<string>;
