"use client";

import { Alert } from "@/components/Alert";

// Error state for signed-in pages. The message is generic on purpose: no error text from the server is shown.
export default function ConsoleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="error-box">
      <Alert tone="error" title="Something went wrong">
        This page could not be loaded. Your data is unchanged. Try again, and if it keeps failing check the health endpoint.
      </Alert>
      <button type="button" className="btn btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
