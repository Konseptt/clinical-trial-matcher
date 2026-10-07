import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { Figtree, Fira_Code, Fraunces } from "next/font/google";
import { auth } from "@/auth";
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
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Clinical Trial Matcher",
    template: "%s | Clinical Trial Matcher",
  },
  description:
    "Search ClinicalTrials.gov, EU, WHO, and ISRCTN records and forecast when a washout line in the registry text might clear. Estimates only. The study team confirms eligibility.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Clinical Trial Matcher",
    description:
      "Recruiting studies from public registries, with a washout forecast from the criteria text. Estimates only.",
    url: SITE_URL,
    siteName: "Clinical Trial Matcher",
    type: "website",
  },
};

async function Masthead() {
  const session = await auth();

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
        <Link href={session?.user ? "/profile" : "/sign-in"} className="font-body text-sm text-primary hover:text-foreground">
          {session?.user ? "Profile" : "Sign in"}
        </Link>
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
          strategy="afterInteractive"
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
          <main id="main" className="w-full">{children}</main>
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
                Contact
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
