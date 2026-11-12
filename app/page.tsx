import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import HomeClient from "@/components/HomeClient";
import { listKnownConditions } from "@/lib/normalization";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Find Clinical Trials for Your Condition: Free, 4 Registries" },
  description:
    "Paste your diagnosis and treatment history to find recruiting clinical trials from ClinicalTrials.gov, EU CTR, WHO ICTRP, and ISRCTN, ranked by how well you fit, with age, sex, biomarker, and washout checks. Free, no sign-up.",
  alternates: { canonical: "/" },
};

const FAQ: Array<[string, string]> = [
  [
    "Is Clinical Trial Matcher free?",
    "Yes. Searching is free and needs no account. Signing in with Google is optional and adds saved profiles and plain-language AI summaries."
  ],
  [
    "Which trial registries does it search?",
    "ClinicalTrials.gov (US NIH), the EU Clinical Trials Register and CTIS, the WHO International Clinical Trials Registry Platform, and ISRCTN. Duplicate listings of the same study are merged."
  ],
  [
    "How are trials ranked?",
    "Each recruiting study is scored against your diagnosis, biomarkers, treatment history, age, sex, and location. Studies whose published age or sex limits exclude you, or whose exclusion criteria name your conditions or treatments, are ranked lower. The method is described on the How matching works page."
  ],
  [
    "Does it tell me if I am eligible?",
    "No. It estimates fit from public registry text. Only the study team can confirm eligibility after screening. Use the results to prepare questions for your doctor or the study contact."
  ],
  [
    "Are my notes stored?",
    "Your notes are sent to run the search and kept in your browser session. They are not saved to an account unless you sign in and choose to save a profile."
  ],
  [
    "What is the washout forecast?",
    "Many trials require a gap since your last treatment. The matcher reads those rules from the criteria and estimates the date you could qualify, so you can plan ahead."
  ]
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
  "@type": "WebApplication",
  name: "Clinical Trial Matcher",
  url: SITE_URL,
  applicationCategory: "HealthApplication",
  description:
    "Searches public trial registries and forecasts when a washout period in the registry text might clear. It does not decide eligibility.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  operatingSystem: "Any",
  featureList: [
    "Searches ClinicalTrials.gov, EU CTR/CTIS, WHO ICTRP and ISRCTN",
    "Ranks recruiting studies by fit to diagnosis, biomarkers, treatments, age, sex and location",
    "Washout-period eligibility forecast with calendar reminders",
  ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    },
  ],
};

export default function Home() {
  const conditions = listKnownConditions();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <header className="mb-10 w-full max-w-2xl">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-foreground text-pretty leading-tight">
          Find clinical trials that fit you
        </h1>
        <p className="section-hint mt-2">
          Paste your diagnosis, treatment history, and location. We search four
          global trial registries at once, rank recruiting studies by how well
          you fit, and show when you could become eligible.
        </p>
      </header>

      <Suspense fallback={<p className="py-6 text-faint font-body">Loading</p>}>
        <HomeClient />
      </Suspense>

      <section className="mt-16 max-w-2xl border-t border-border-subtle pt-10" aria-labelledby="method-heading">
        <h2 id="method-heading" className="section-title">
          Browse clinical trials by condition
        </h2>
        <p className="section-hint mt-3">
          A personalized list is an estimate from registry criteria and the
          dates you enter.{" "}
          <Link href="/how-matching-works" className="text-primary underline underline-offset-2">
            How matching works
          </Link>{" "}
          is the public description of the query, the line labels, and the
          washout forecast. Your notes are not part of that page.
        </p>
        <ul className="mt-6 columns-1 sm:columns-2 gap-x-8">
          {conditions.map((condition) => (
            <li key={condition.slug} className="break-inside-avoid">
              <Link
                href={`/conditions/${condition.slug}`}
                className="block py-1.5 text-sm text-foreground hover:text-primary"
              >
                {condition.canonicalName}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16 max-w-2xl border-t border-border-subtle pt-10" aria-labelledby="faq-heading">
        <h2 id="faq-heading" className="section-title">Frequently asked questions</h2>
        <dl className="mt-6 space-y-6">
          {FAQ.map(([q, a]) => (
            <div key={q}>
              <dt className="font-display text-lg font-semibold text-foreground">{q}</dt>
              <dd className="mt-1 text-body-muted">{a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
