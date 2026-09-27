import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatTrialStatus } from "@/lib/format";
import { findKnownCondition, listKnownConditions } from "@/lib/normalization";
import { fetchRecruitingStudies } from "@/lib/public-studies";

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return listKnownConditions().map((condition) => ({ slug: condition.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const condition = findKnownCondition(slug);
  if (!condition) return { title: "Condition" };

  return {
    title: `${condition.canonicalName} recruiting studies and washout check`,
    description: `Recruiting and not-yet-recruiting ${condition.canonicalName} studies from ClinicalTrials.gov, plus the query this matcher sends. The study team confirms eligibility.`,
    alternates: { canonical: `/conditions/${condition.slug}` },
  };
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default async function ConditionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const condition = findKnownCondition(slug);
  if (!condition) notFound();

  const snapshot = await fetchRecruitingStudies(condition);
  const countLabel =
    snapshot.total === null
      ? "A count was not returned"
      : `${snapshot.total.toLocaleString("en-US")} studies matched`;

  return (
    <article className="max-w-3xl">
      <p className="section-label">Condition</p>
      <h1 className="section-title mt-2">
        {condition.canonicalName} recruiting studies and washout check
      </h1>
      <p className="section-hint mt-4">
        {countLabel} on ClinicalTrials.gov for the query below. Retrieved{" "}
        {formatWhen(snapshot.fetchedAt)}. This page does not say who can enroll.
      </p>

      <h2 className="subsection-title mt-10">Query</h2>
      <p className="mt-3 font-mono text-sm text-foreground break-words">
        {snapshot.query}
      </p>
      <p className="mt-3 text-body-muted">
        Names the matcher also recognizes: {condition.synonyms.join(", ")}.
        Abbreviations shorter than five letters stay off the query so a string
        such as MS does not pull unrelated records. Status filter: recruiting
        or not yet recruiting. The same names are how a personalized search
        starts. Washout timing still needs the treatment end date you enter on
        the{" "}
        <Link href="/" className="text-primary underline underline-offset-2">
          search form
        </Link>
        . Read{" "}
        <Link href="/how-matching-works" className="text-primary underline underline-offset-2">
          how matching works
        </Link>{" "}
        before treating any line below as a fit.
      </p>

      {snapshot.error && (
        <p className="mt-6 text-destructive" role="alert">
          {snapshot.error}. The query above is what this page would send.
        </p>
      )}

      <h2 className="subsection-title mt-10">Studies in this retrieval</h2>
      {snapshot.studies.length === 0 ? (
        <p className="mt-3 text-body-muted">
          No studies were returned for this query on {formatWhen(snapshot.fetchedAt)}.
        </p>
      ) : (
        <ol className="mt-4 divide-y divide-border-subtle border-t border-border-subtle">
          {snapshot.studies.map((study) => (
              <li key={study.nctId} className="py-5">
                <p className="font-mono text-xs text-faint">{study.nctId}</p>
                <h3 className="font-display text-lg font-semibold mt-1 text-pretty">
                  <Link href={`/trials/${study.nctId}`} className="hover:text-primary">
                    {study.title}
                  </Link>
                </h3>
                <p className="mt-1 text-sm text-faint">
                  {formatTrialStatus(study.status)} · {study.phase}
                  {study.registryUpdated ? ` · registry updated ${study.registryUpdated}` : ""}
                </p>
                {study.summary && <p className="mt-2 text-body-muted">{study.summary}</p>}
              </li>
            ))}
        </ol>
      )}
    </article>
  );
}
