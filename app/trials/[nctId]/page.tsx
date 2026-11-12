import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { excerptCriteria } from "@/lib/criteria-excerpt";
import { formatTrialStatus } from "@/lib/format";
import { fetchPublicStudy, isNctId } from "@/lib/public-studies";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbs, jsonLdHtml } from "@/lib/structured-data";

export const revalidate = 86400;

// Empty list = render each trial on first request, then serve it from the ISR cache.
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ nctId: string }>;
}): Promise<Metadata> {
  const { nctId } = await params;
  if (!isNctId(nctId)) return { title: "Study" };
  const study = await fetchPublicStudy(nctId);
  if (!study) return { title: nctId.toUpperCase() };

  const status = formatTrialStatus(study.status);
  const summary = study.summary.replace(/\s+/g, " ").trim();
  const phase = /phase\s*\d/i.test(study.phase) ? ` ${study.phase}` : "";
  const description = `${status}${phase} study (${study.nctId}). ${summary}`.slice(0, 157).replace(/\s+\S*$/, "") + "…";
  return {
    title: study.title,
    description,
    alternates: { canonical: `/trials/${study.nctId}` },
    openGraph: { title: study.title, description, type: "article", url: `/trials/${study.nctId}` },
  };
}

function CriterionList({
  heading,
  lines,
}: {
  heading: string;
  lines: string[];
}) {
  if (lines.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="subsection-title">{heading}</h2>
      <ul className="mt-3 space-y-3">
        {lines.map((line) => (
          <li key={line} className="text-body-muted">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function TrialPage({
  params,
}: {
  params: Promise<{ nctId: string }>;
}) {
  const { nctId } = await params;
  if (!isNctId(nctId)) notFound();

  const study = await fetchPublicStudy(nctId);
  if (!study) notFound();

  const excerpt = excerptCriteria(study.eligibilityText);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MedicalTrial",
    name: study.title,
    identifier: study.nctId,
    url: absoluteUrl(`/trials/${study.nctId}`),
    sameAs: study.url,
    phase: study.phase,
    status: formatTrialStatus(study.status),
    ...(study.sponsor ? { sponsor: { "@type": "Organization", name: study.sponsor } } : {}),
    description:
      "Quoted from the public registry record. This page does not assess who can enroll.",
  };

  return (
    <article className="max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdHtml({
          "@context": "https://schema.org",
          "@graph": [
            { ...jsonLd, "@context": undefined },
            breadcrumbs([["Home", "/"], ["Conditions", "/conditions"], [study.nctId, `/trials/${study.nctId}`]]),
          ],
        })}
      />
      <p className="font-mono text-xs text-faint">{study.nctId}</p>
      <h1 className="section-title mt-2">{study.title}</h1>
      <p className="mt-3 text-sm text-faint">
        {formatTrialStatus(study.status)} · {study.phase}
        {study.sponsor ? ` · ${study.sponsor}` : ""}
        {study.registryUpdated ? ` · registry updated ${study.registryUpdated}` : ""}
      </p>
      <p className="section-hint mt-4">
        Inclusion and exclusion lines below are quoted from ClinicalTrials.gov.
        No match score is shown, because a score needs a person&apos;s age,
        biomarkers, and treatment dates. Confirm the record with the study team.
      </p>
      {study.summary && <p className="mt-4 text-body-muted">{study.summary}</p>}

      <CriterionList
        heading={excerpt.unlabeled ? "Criteria excerpt" : "Inclusion"}
        lines={excerpt.inclusion}
      />
      <CriterionList heading="Exclusion" lines={excerpt.exclusion} />

      <p className="mt-10 flex flex-col sm:flex-row gap-4">
        <a
          href={study.url}
          className="btn-secondary"
          rel="noopener noreferrer"
        >
          Open {study.nctId} on ClinicalTrials.gov
        </a>
        <Link href="/conditions" className="btn-ghost">
          All conditions
        </Link>
      </p>
    </article>
  );
}
