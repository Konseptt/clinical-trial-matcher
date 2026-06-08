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
      <h2
        id="analysis-heading"
        className="font-display text-xl text-foreground text-pretty mb-2"
      >
        Process overview
      </h2>
      <p className="section-hint text-xs mb-5">Four stages</p>

      <ol className="timeline-rail" aria-label="Process overview">
        {steps.map((step, i) => (
          <li key={step} className="timeline-step">
            <span className="step-number" aria-hidden="true">
              {i + 1}
            </span>
            <span className="text-foreground/90 leading-relaxed text-[0.95rem] pt-1">
              {step}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
