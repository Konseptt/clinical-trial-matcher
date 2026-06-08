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
    <header className="mb-10 max-w-3xl relative">
      <p className="section-label mb-4">Clinical trial registry search</p>
      <h1 className="font-display text-[2.75rem] sm:text-[3.25rem] leading-[1.05] text-foreground text-pretty">
        Identify trials matched to{" "}
        <em className="not-italic text-accent">clinical profile</em>
      </h1>
      <div className="masthead-flourish" aria-hidden="true">
        <span />
      </div>
      <p className="section-hint text-[1.05rem] max-w-xl">
        Enter diagnosis, treatment history, and location. The system queries
        public registries and ranks open studies by estimated eligibility fit.
      </p>
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
      <body className="min-h-dvh flex flex-col">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>

        <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 md:py-14">
          <Masthead />
          <main id="main">{children}</main>
        </div>

        <footer className="mt-auto">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="border-t border-border-subtle" />
            <p className="py-8 section-hint text-xs max-w-2xl">
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
