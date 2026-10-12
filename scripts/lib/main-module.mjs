import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// True when the module identified by `metaUrl` (pass import.meta.url) is the script that node
// was started with. Comparing `file://${process.argv[1]}` by hand is wrong: import.meta.url is
// percent-encoded, argv[1] is a raw path, so any space, '#', '%' or non-ASCII character (and
// Windows drive paths) makes the strings differ and the script silently does nothing.
// pathToFileURL encodes the same way; realpath covers a symlinked script path.
export function isMainModule(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false;
  try {
    return metaUrl === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return metaUrl === pathToFileURL(argv1).href;
  }
}
