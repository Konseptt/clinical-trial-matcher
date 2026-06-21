import type { Metadata } from "next";
import { Figtree, Fira_Code, Fraunces } from "next/font/google";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-figtree",
  display: "swap",
});

// Display face: warm, optical-size serif. Distinct from the Figtree body.
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
    <header className="mb-10 w-full max-w-2xl">
      <h1 className="font-display text-3xl sm:text-4xl font-semibold text-foreground text-pretty leading-tight">
        Clinical Trial Matcher
      </h1>
      <p className="section-hint mt-2">
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
      className={`${figtree.variable} ${fraunces.variable} ${firaCode.variable}`}
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
