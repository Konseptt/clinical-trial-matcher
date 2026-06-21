import type { AppMode } from "@/lib/types";

export default function LoadingProgress({ mode = "doctor" }: { mode?: AppMode }) {
  const steps =
    mode === "patient"
      ? [
          "Processing clinical summary",
          "Querying trial registries",
          "Ranking candidate studies",
        ]
      : [
          "Processing clinical notes",
          "Querying trial registries",
          "Ranking candidate studies",
        ];

  return (
    <div
      className="mt-10 max-w-md"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Searching for matching trials"
    >
      <h2 className="section-title mb-2">
        Searching registries
      </h2>
      <p className="section-hint mb-8">
        This typically completes within a few seconds across multiple data sources.
      </p>

      <ol aria-label="Search progress">
        {steps.map((label, i) => (
          <li
            key={label}
            className={`loading-step ${i === 0 ? "text-foreground" : "text-faint-muted"}`}
            aria-current={i === 0 ? "step" : undefined}
          >
            {i === 0 ? (
              <span className="loading-dot" aria-hidden="true" />
            ) : (
              <span
                className="w-1.5 h-1.5 rounded-full bg-border shrink-0"
                aria-hidden="true"
              />
            )}
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
