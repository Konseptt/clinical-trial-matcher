export default function AnalysisIntro() {
  const steps = [
    "Paste notes about diagnosis, stage, biomarkers, and where the patient lives",
    "We pull out the important details automatically",
    "We search ClinicalTrials.gov, EU-CTR, WHO ICTRP, and ISRCTN",
    "You get a ranked list of open trials to discuss with a doctor",
  ];

  return (
    <div className="info-card lg:sticky lg:top-8">
      <h2
        id="analysis-heading"
        className="font-display text-xl text-foreground text-pretty mb-4"
      >
        How it works
      </h2>

      <ol className="space-y-4" aria-label="How it works">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span
              className="step-number"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="section-hint leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
