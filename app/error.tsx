"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console in production for debugging
    console.error("Production Error:", error);
    console.error("Error digest:", error.digest);
    console.error("Error stack:", error.stack);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full">
        <h2 className="text-2xl font-bold text-red-500 mb-4">Something went wrong!</h2>
        
        {/* Show error details in development or when explicitly enabled */}
        {process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_SHOW_ERRORS === "true" ? (
          <div className="mb-4">
            <p className="text-gray-300 mb-2">Error: {error.message}</p>
            {error.digest && (
              <p className="text-gray-400 text-sm">Digest: {error.digest}</p>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-gray-400 hover:text-gray-300">
                Stack trace
              </summary>
              <pre className="text-xs text-gray-500 overflow-auto mt-2 p-2 bg-gray-900 rounded">
                {error.stack}
              </pre>
            </details>
          </div>
        ) : (
          <p className="text-gray-300 mb-4">
            An unexpected error occurred. Please try again.
          </p>
        )}
        
        <button
          onClick={reset}
          className="w-full bg-[#FFAA00] hover:bg-[#e69500] text-black font-semibold py-2 px-4 rounded transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}