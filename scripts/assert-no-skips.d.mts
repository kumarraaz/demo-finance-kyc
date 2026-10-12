export function evaluateReport(report: {
  numTotalTests?: number;
  numPendingTests?: number;
  numTodoTests?: number;
  numFailedTests?: number;
} | null): string[];
