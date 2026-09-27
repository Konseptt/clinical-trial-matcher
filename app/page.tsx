import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import HomeClient from "@/components/HomeClient";
import { listKnownConditions } from "@/lib/normalization";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
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
          Clinical Trial Matcher
        </h1>
        <p className="section-hint mt-2">
          Enter diagnosis, treatment history, and location. The system searches
          public registries, ranks open studies by estimated eligibility fit, and
          forecasts when you could become eligible.
        </p>
      </header>

      <Suspense fallback={<p className="py-6 text-faint font-body">Loading</p>}>
        <HomeClient />
      </Suspense>

      <section className="mt-16 max-w-2xl border-t border-border-subtle pt-10" aria-labelledby="method-heading">
        <h2 id="method-heading" className="section-title">
          What a result is based on
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
    </>
  );
}
