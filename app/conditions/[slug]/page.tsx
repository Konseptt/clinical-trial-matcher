import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/site";
import { jsonLdHtml, breadcrumbs } from "@/lib/structured-data";
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
    title: `${condition.canonicalName} Clinical Trials: Recruiting Studies`,
    description: `Browse recruiting ${condition.canonicalName} clinical trials from ClinicalTrials.gov, updated daily. Paste your notes to rank ${condition.canonicalName} studies across four registries by how well you fit. Free.`,
    alternates: { canonical: `/conditions/${condition.slug}` },
    openGraph: { url: `/conditions/${condition.slug}`, type: "website" },
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              name: `${condition.canonicalName} recruiting clinical trials`,
              url: absoluteUrl(`/conditions/${condition.slug}`),
              about: { "@type": "MedicalCondition", name: condition.canonicalName, alternateName: condition.synonyms },
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: snapshot.studies.length,
                itemListElement: snapshot.studies.map((study, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: absoluteUrl(`/trials/${study.nctId}`),
                  name: study.title,
                })),
              },
            },
            breadcrumbs([["Home", "/"], ["Conditions", "/conditions"], [condition.canonicalName, `/conditions/${condition.slug}`]]),
          ],
        })}
      />
      <p className="section-label">Condition</p>
      <h1 className="section-title mt-2">
        {condition.canonicalName} clinical trials
      </h1>
      <p className="mt-4 text-body-muted">
        Recruiting and not-yet-recruiting {condition.canonicalName} studies, refreshed
        daily. Want them ranked for you? Paste your diagnosis, treatments, and
        location and the matcher checks ClinicalTrials.gov, EU, WHO, and ISRCTN
        registries for studies that fit.
      </p>
      <p className="mt-4">
        <Link href="/" className="text-primary font-semibold underline underline-offset-2">
          Match {condition.canonicalName} trials to my notes
        </Link>
      </p>
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
      <nav aria-label="Other conditions" className="mt-12 border-t border-border-subtle pt-6">
        <h2 className="subsection-title">Clinical trials for other conditions</h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {listKnownConditions()
            .filter((c) => c.slug !== condition.slug)
            .map((c) => (
              <li key={c.slug}>
                <Link href={`/conditions/${c.slug}`} className="text-primary hover:text-foreground">
                  {c.canonicalName} trials
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </article>
  );
}
