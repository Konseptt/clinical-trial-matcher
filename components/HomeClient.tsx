"use client";

import { useState } from "react";
import AnalysisIntro from "@/components/AnalysisIntro";
import MatchForm from "@/components/MatchForm";
import type { AppMode } from "@/lib/types";

export default function HomeClient() {
  const [mode, setMode] = useState<AppMode>("patient");

  return (
    <div className="page-spine grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 xl:gap-20 items-start">
      <div className="lg:col-span-5 xl:col-span-4 margin-rail space-y-8">
        <nav aria-label="Search mode" className="flex gap-8 border-b border-border-subtle">
          <button
            type="button"
            onClick={() => setMode("patient")}
            className={mode === "patient" ? "mode-tab-active" : "mode-tab"}
          >
            Patient
          </button>
          <button
            type="button"
            onClick={() => setMode("doctor")}
            className={mode === "doctor" ? "mode-tab-active" : "mode-tab"}
          >
            Clinician
          </button>
        </nav>

        <p className="callout text-[0.9rem]">
          {mode === "patient"
            ? "Provide a narrative clinical summary. The system extracts key eligibility variables and searches major international registries."
            : "Enter structured information from the medical record. The system parses eligibility criteria and queries major trial registries."}
        </p>

        <AnalysisIntro mode={mode} />
      </div>

      <div className="lg:col-span-7 xl:col-span-8">
        <MatchForm mode={mode} />
      </div>
    </div>
  );
}
