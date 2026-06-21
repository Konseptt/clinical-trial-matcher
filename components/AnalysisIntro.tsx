import type { AppMode } from "@/lib/types";

export default function AnalysisIntro({ mode }: { mode: AppMode }) {
  const steps =
    mode === "patient"
      ? [
          "Submit a narrative description of diagnosis and treatment history",
          "Key eligibility variables are structured for registry search",
          "ClinicalTrials.gov, EU-CTR, WHO ICTRP, and ISRCTN are queried",
          "Ranked results are reviewed with the oncology care team",
        ]
      : [
          "Enter diagnosis, stage, biomarkers, and location from the chart",
          "Structured search terms are extracted from clinical input",
          "ClinicalTrials.gov, EU-CTR, WHO ICTRP, and ISRCTN are queried",
          "A ranked shortlist is prepared for patient discussion",
        ];

  return (
    <section aria-labelledby="analysis-heading" className="lg:sticky lg:top-8">
      <h2 id="analysis-heading" className="subsection-title mb-4">
        How it works
      </h2>

      <ol className="space-y-3" aria-label="Process overview">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-3 font-body text-base text-foreground/90">
            <span className="text-faint tabular-nums shrink-0" aria-hidden="true">
              {i + 1}.
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
