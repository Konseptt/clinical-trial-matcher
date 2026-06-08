export default function LoadingProgress() {
  const steps = [
    "Reading your notes",
    "Searching trial registries",
    "Ranking the best matches",
  ];

  return (
    <div
      className="mt-8 info-card"
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Searching for matching trials"
    >
      <p className="section-label mb-1">Looking for trials</p>
      <p className="section-hint mb-5">
        This usually takes a few seconds. We are checking several registries at
        once.
      </p>

      <ol className="space-y-4" aria-label="Search progress">
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
                className="w-2 h-2 rounded-full bg-border mt-2 shrink-0"
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
