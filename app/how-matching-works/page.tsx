import type { Metadata } from "next";
import Link from "next/link";
import { absoluteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "How matching works",
  description:
    "How Clinical Trial Matcher queries public registries, labels eligibility lines, and forecasts a washout date. Scores are estimates. The study team confirms eligibility.",
  alternates: { canonical: "/how-matching-works" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "MedicalWebPage",
  name: "How Clinical Trial Matcher searches registries",
  url: absoluteUrl("/how-matching-works"),
  description:
    "The matcher queries public registries, labels each eligibility line as met, not met, or unknown, and projects a washout date from the registry sentence and the dates you enter. It does not decide eligibility.",
  lastReviewed: "2026-09-27",
};

export default function HowMatchingWorksPage() {
  return (
    <article className="max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <p className="section-label">Method</p>
      <h1 className="section-title mt-2">How matching works</h1>
      <p className="section-hint mt-4">
        The matcher reads public registry records and the dates you type. It
        does not decide whether you can enroll. The study team does.
      </p>

      <h2 className="subsection-title mt-10">What gets searched</h2>
      <p className="mt-3 text-body-muted">
        A search asks ClinicalTrials.gov, EU-CTR, WHO ICTRP, and ISRCTN for
        studies that are recruiting or not yet recruiting. The condition query
        joins the canonical name and longer synonyms with OR. Biomarkers are a
        separate query, merged afterward, so a marker such as HER2 does not
        delete breast cancer studies that never mention that word. Prior drugs
        stay out of the retrieval filter. They are compared later with the
        eligibility text.
      </p>
      <p className="mt-3 text-body-muted">
        Location is not used to drop the rest of the country. A study with no
        listed sites stays unknown, not distant. Phase II and later is the
        default view because early-phase studies are a smaller set. Counts on
        the condition pages are the ClinicalTrials.gov slice of that query,
        cached for about a day, with the retrieval time printed on the page.
      </p>

      <h2 className="subsection-title mt-10">How a line is labeled</h2>
      <p className="mt-3 text-body-muted">
        Eligibility text is split into inclusion and exclusion. Each line is
        marked met, not met, or unknown, and the registry sentence is kept next
        to the label. Age and sex use the structured fields when the registry
        sends them. An exclusion sentence that names a drug already on the
        profile is not scored as a point in favor of the study. A washout date
        is the registry interval plus the end date you entered. If the interval
        is not tied to that drug name, the forecast does not invent a date.
      </p>
      <p className="mt-3 text-body-muted">
        The number on a result is a summary of those labels. It is an estimate
        from public criteria and the information you provided. A model may help
        turn a patient narrative into those fields. It does not overrule a hard
        mismatch on age, sex, or an opposite biomarker, and it does not change
        the default order by itself.
      </p>

      <h2 className="subsection-title mt-10">What stays off the index</h2>
      <p className="mt-3 text-body-muted">
        Search results live in this browser until you leave. Notes are not
        published, and a personalized result page is not indexed. Public pages
        list registry records only. Confirm any study with the team running it
        before you try to join.
      </p>

      <p className="mt-10">
        <Link href="/conditions" className="text-primary underline underline-offset-2">
          Conditions this matcher names
        </Link>
      </p>
    </article>
  );
}
