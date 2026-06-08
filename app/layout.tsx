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
  title: "Trial Finder",
  description:
    "Paste clinical notes to find recruiting trials that may fit a patient's diagnosis, location, and treatment history.",
};

function Masthead() {
  return (
    <header className="mb-10">
      <p className="section-label text-primary mb-2">
        For patients, caregivers, and care teams
      </p>
      <h1 className="font-display text-[2.25rem] sm:text-[2.75rem] leading-tight text-foreground text-pretty">
        Find clinical trials that may be a fit
      </h1>
      <p className="section-hint mt-3 max-w-3xl">
        Paste a short clinical summary. We read the key details, search major
        trial registries, and show the best matches ranked for you to review
        with a doctor.
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
            <p className="py-7 section-hint text-xs">
              This tool is for research only. It does not store your notes, does
              not give medical advice, and cannot enroll anyone in a trial. Always
              talk with a healthcare provider before pursuing a study.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
