"use client";

import { useState } from "react";
import AnalysisIntro from "@/components/AnalysisIntro";
import MatchForm from "@/components/MatchForm";
import type { AppMode } from "@/lib/types";

export default function HomeClient() {
  const [mode, setMode] = useState<AppMode>("patient");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start w-full">
      <div className="lg:col-span-5 margin-rail space-y-8">
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

        <p className="callout">
          {mode === "patient"
            ? "Provide a narrative clinical summary. The system extracts key eligibility variables and searches major international registries."
            : "Enter structured information from the medical record. The system parses eligibility criteria and queries major trial registries."}
        </p>

        <AnalysisIntro mode={mode} />
      </div>

      <div className="lg:col-span-7">
        <MatchForm mode={mode} />
      </div>
    </div>
  );
}
