// Prints a scrypt hash for ADMIN_PASSWORD_HASH. Stores nothing.
//
//   npm run hash-password                         -> hidden prompt (asks twice)
//   printf '%s' "$PW" | npm run hash-password     -> reads the password from stdin
//
// The password is deliberately NOT accepted as a command-line argument: arguments end up in
// shell history and are visible to other users in process lists.
import { randomBytes, scryptSync } from "node:crypto";
import { stderr, stdin } from "node:process";
import { readSecret } from "./lib/prompt.mjs";

// Must match the login form / API limits, or the password could never be typed back in.
export const MIN_LENGTH = 12;
export const MAX_LENGTH = 200;

if (process.argv.length > 2) {
  stderr.write(
    "Do not pass the password as an argument (it would be saved in shell history and visible in process lists).\n" +
      "Run `npm run hash-password` for a hidden prompt, or pipe it on stdin.\n",
  );
  process.exit(2);
}

try {
  const password = await readSecret("Admin password (input hidden): ");
  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
    stderr.write(`Password must be ${MIN_LENGTH}-${MAX_LENGTH} characters.\n`);
    process.exit(1);
  }
  if (stdin.isTTY) {
    const again = await readSecret("Repeat the password: ");
    if (again !== password) {
      stderr.write("Passwords do not match. Nothing was generated.\n");
      process.exit(1);
    }
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  console.log(`scrypt$${salt.toString("hex")}$${hash.toString("hex")}`);
} catch (e) {
  stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
