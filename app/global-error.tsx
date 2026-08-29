"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-[#FAF8F5] text-[#1E1E1E] p-8 font-sans">
        <div className="max-w-xl mx-auto py-12 space-y-6">
          <h2 className="text-2xl font-serif font-bold text-gray-900">Application Error</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            An unexpected error occurred. Please try reloading the application.
          </p>
          {error.digest && (
            <p className="text-xs font-mono text-gray-500">
              Error reference: {error.digest}
            </p>
          )}
          <div>
            <button
              type="button"
              onClick={() => reset()}
              className="px-4 py-2 bg-[#2D5A47] text-white rounded font-medium text-sm hover:bg-[#234737]"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
