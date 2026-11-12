import type { Metadata } from "next";
import Link from "next/link";
import { listKnownConditions } from "@/lib/normalization";

export const metadata: Metadata = {
  title: "Clinical Trials by Condition",
  description:
    "Browse recruiting clinical trials by condition (cancers, multiple sclerosis, Alzheimer's, ALS and more) from ClinicalTrials.gov, updated daily.",
  alternates: { canonical: "/conditions" },
};

export default function ConditionsPage() {
  const conditions = listKnownConditions();

  return (
    <article>
      <p className="section-label">Catalog</p>
      <h1 className="section-title mt-2">Conditions</h1>
      <p className="section-hint mt-4 max-w-2xl">
        Each page shows the names sent to ClinicalTrials.gov and a dated count
        of recruiting and not-yet-recruiting studies. The method is{" "}
        <Link href="/how-matching-works" className="text-primary underline underline-offset-2">
          written out here
        </Link>
        .
      </p>
      <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-8 border-t border-border-subtle">
        {conditions.map((condition) => (
          <li key={condition.slug}>
            <Link
              href={`/conditions/${condition.slug}`}
              className="block py-3 border-b border-border-subtle font-body text-foreground hover:text-primary"
            >
              {condition.canonicalName}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
