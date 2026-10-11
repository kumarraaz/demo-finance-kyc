// Fails if a Vitest JSON report contains skipped/todo tests or no tests at all.
// Used in CI so that PostgreSQL-backed tests can never be silently skipped.
// Usage: node scripts/assert-no-skips.mjs vitest-results.json
import fs from "node:fs";

/** @param {{numTotalTests?: number, numPendingTests?: number, numTodoTests?: number, numFailedTests?: number}} report */
export function evaluateReport(report) {
  const problems = [];
  if (!report || !report.numTotalTests) problems.push("report contains no tests");
  if (report?.numPendingTests) problems.push(`${report.numPendingTests} test(s) were skipped`);
  if (report?.numTodoTests) problems.push(`${report.numTodoTests} test(s) are marked todo`);
  if (report?.numFailedTests) problems.push(`${report.numFailedTests} test(s) failed`);
  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node scripts/assert-no-skips.mjs <vitest-json-report>");
    process.exit(2);
  }
  const problems = evaluateReport(JSON.parse(fs.readFileSync(file, "utf8")));
  if (problems.length) {
    console.error(`CI test gate FAILED: ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("CI test gate passed: no skipped, todo or failed tests.");
}
