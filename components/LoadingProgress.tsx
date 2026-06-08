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
      className="mt-10 max-w-md margin-rail"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Searching for matching trials"
    >
      <h2 className="font-display text-2xl text-foreground mb-2">
        Searching registries
      </h2>
      <p className="section-hint mb-8">
        This typically completes within a few seconds across multiple data sources.
      </p>

      <ol className="timeline-rail" aria-label="Search progress">
        {steps.map((label, i) => (
          <li
            key={label}
            className={i === 0 ? "loading-step-active" : "loading-step-wait"}
            aria-current={i === 0 ? "step" : undefined}
          >
            {i === 0 ? (
              <span className="loading-dot" aria-hidden="true" />
            ) : (
              <span
                className="absolute -left-8 w-1.5 h-1.5 rounded-full bg-border mt-2"
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
