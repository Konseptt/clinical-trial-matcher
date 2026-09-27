import type { Metadata } from "next";
import Link from "next/link";
import { listKnownConditions } from "@/lib/normalization";

export const metadata: Metadata = {
  title: "Conditions",
  description:
    "Conditions Clinical Trial Matcher can name in a registry query, with a washout check against recruiting studies.",
  alternates: { canonical: "/conditions" },
};

export default function ConditionsPage() {
  const conditions = listKnownConditions();

  return (
    <article className="max-w-2xl">
      <p className="section-label">Catalog</p>
      <h1 className="section-title mt-2">Conditions</h1>
      <p className="section-hint mt-4">
        Each page shows the names sent to ClinicalTrials.gov and a dated count
        of recruiting and not-yet-recruiting studies. The method is{" "}
        <Link href="/how-matching-works" className="text-primary underline underline-offset-2">
          written out here
        </Link>
        .
      </p>
      <ul className="mt-8 divide-y divide-border-subtle border-t border-border-subtle">
        {conditions.map((condition) => (
          <li key={condition.slug}>
            <Link
              href={`/conditions/${condition.slug}`}
              className="block py-3 font-body text-foreground hover:text-primary"
            >
              {condition.canonicalName}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
