// Small helpers to read secrets without putting them on a command line.
// Prompts go to stderr so stdout stays clean for piping.
import { stdin, stderr } from "node:process";

/** Read all of stdin (for `printf '%s' "$PW" | npm run ...`). Strips one trailing newline. */
export async function readStdin() {
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

/** Read a line from the terminal without echoing it. Falls back to stdin when not a TTY. */
export async function readSecret(prompt) {
  if (!stdin.isTTY) return readStdin();
  stderr.write(prompt);
  return new Promise((resolve, reject) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (fn, arg) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stderr.write("\n");
      fn(arg);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\u0003") return done(reject, new Error("Cancelled")); // Ctrl-C
        if (ch === "\r" || ch === "\n" || ch === "\u0004") return done(resolve, value); // Enter / Ctrl-D
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1); // Backspace
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}
