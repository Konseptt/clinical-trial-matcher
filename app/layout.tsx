import type { Metadata } from "next";
import { Instrument_Serif, Figtree, Fira_Code } from "next/font/google";
import "./globals.css";

const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
});

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-fira-code",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Clinical Trial Matcher",
    template: "%s, Clinical Trial Matcher",
  },
  description:
    "Search international clinical trial registries using patient clinical information to identify potentially eligible studies.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

function Masthead() {
  return (
    <header className="mb-10 w-full grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 items-start">
      <div>
        <p className="section-label mb-2">Clinical trial registry search</p>
        <h1 className="text-3xl sm:text-4xl text-foreground text-pretty leading-snug">
          Identify trials matched to{" "}
          <em className="not-italic text-accent">clinical profile</em>
        </h1>
      </div>
      <div className="lg:pt-8">
        <p className="section-hint max-w-lg">
          Enter diagnosis, treatment history, and location. The system queries
          public registries and ranks open studies by estimated eligibility fit.
        </p>
      </div>
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
      className={`${instrument.variable} ${figtree.variable} ${firaCode.variable}`}
    >
      <body>
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
            <p className="py-6 section-hint text-sm leading-relaxed">
              For informational purposes only. This tool does not provide medical advice,
              diagnosis, or treatment recommendations, and cannot enroll patients in studies.
              Confirm eligibility with your oncology care team before pursuing any trial.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
