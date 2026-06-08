export default function AnalysisIntro() {
  const steps = [
    "Paste notes about diagnosis, stage, biomarkers, and where the patient lives",
    "We pull out the important details automatically",
    "We search ClinicalTrials.gov, EU-CTR, WHO ICTRP, and ISRCTN",
    "You get a ranked list of open trials to discuss with a doctor",
  ];

  return (
    <div className="mb-8">
      <h2 id="analysis-heading" className="sr-only">
        How trial matching works
      </h2>

      <ol className="space-y-2.5" aria-label="How it works">
        {steps.map((step, i) => (
          <li key={step} className="flex items-start gap-3">
            <span
              className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-body text-xs font-semibold shrink-0 mt-0.5"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <span className="section-hint">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
