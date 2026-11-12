import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { Figtree, Fira_Code, Fraunces } from "next/font/google";
import AuthNav from "@/components/AuthNav";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-fraunces",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-fira-code",
  display: "swap",
  preload: false, // only small IDs use it; keep it off the critical path
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Clinical Trial Matcher",
    template: "%s | Clinical Trial Matcher",
  },
  description:
    "Free clinical trial search. Paste your diagnosis and treatment history to find recruiting studies across ClinicalTrials.gov, the EU, WHO, and ISRCTN registries, ranked by how well you fit. No sign-up.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Clinical Trial Matcher",
    description:
      "Find recruiting clinical trials that fit your diagnosis, across four global registries. Free, no sign-up.",
    url: SITE_URL,
    siteName: "Clinical Trial Matcher",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clinical Trial Matcher: find trials that fit you",
    description:
      "Paste your notes, get recruiting trials from four registries ranked by fit. Free, no sign-up.",
  },
  robots: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  keywords: ["clinical trials", "clinical trial search", "recruiting studies", "trial eligibility", "ClinicalTrials.gov", "EU clinical trials register", "WHO ICTRP", "ISRCTN"],
};

function Masthead() {
  return (
    <header className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
      <Link href="/" className="font-display text-lg font-semibold text-foreground">
        Clinical Trial Matcher
      </Link>
      <nav aria-label="Site" className="flex flex-wrap gap-6 items-center">
        <Link href="/how-matching-works" className="font-body text-sm text-faint hover:text-foreground">
          How matching works
        </Link>
        <Link href="/conditions" className="font-body text-sm text-faint hover:text-foreground">
          Conditions
        </Link>
        <AuthNav />
      </nav>
    </header>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${fraunces.variable} ${firaCode.variable}`}
    >
      <body>
        <Script
          id="microsoft-clarity"
          strategy="lazyOnload"
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "yt9jknem3b");`,
          }}
        />
        <a href="#main" className="skip-link">
          Skip to main content
        </a>

        <div className="page-wrap py-8 md:py-10">
          <Masthead />
          <main id="main" className="w-full" data-clarity-mask="True">{children}</main>
        </div>

        <footer>
          <div className="page-wrap">
            <div className="border-t border-border-subtle" />
            <p className="pt-6 pb-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <Link href="/how-matching-works" className="text-primary underline underline-offset-2">
                How matching works
              </Link>
              <Link href="/conditions" className="text-primary underline underline-offset-2">
                Conditions
              </Link>
              <a href="mailto:contact@clinicaltrial.world" className="text-primary underline underline-offset-2">
                contact@clinicaltrial.world
              </a>
            </p>
            <p className="pb-6 section-hint text-sm leading-relaxed">
              For informational purposes only. This tool does not provide medical advice, diagnosis, or treatment recommendations and cannot enroll patients in studies. Eligibility estimates are based on publicly available trial criteria and the information provided. Confirm eligibility directly with the study team or an appropriate healthcare professional.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
