"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error boundary caught:", error);
  }, [error]);

  return (
    <div className="space-y-6 py-10">
      <div className="max-w-lg">
        <h2 className="font-display text-2xl text-foreground">Something went wrong</h2>
        <p className="mt-3 text-sm text-faint font-body leading-relaxed">
          An unexpected error occurred while processing your request. You can try again or return to the search page.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs font-mono text-faint">
            Error ID: {error.digest}
          </p>
        )}
      </div>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => reset()}
          className="btn-primary"
        >
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Return to search
        </Link>
      </div>
    </div>
  );
}
