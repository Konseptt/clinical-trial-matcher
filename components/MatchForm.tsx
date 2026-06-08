"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MODE_STORAGE_KEY } from "@/lib/mode";
import { SAMPLE_NOTES, SAMPLE_PATIENT_DESCRIPTION } from "@/lib/sample-notes";
import type { AppMode, PatientProfile } from "@/lib/types";

export default function MatchForm({ mode }: { mode: AppMode }) {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<
    Array<{ id: string; name: string; profile: PatientProfile }>
  >([]);
  const [searchHistory, setSearchHistory] = useState<
    Array<{ id: string; notes: string; timestamp: number }>
  >([]);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const isDoctorSample = searchParams.get("sample") === "1";
    const isPatientSample = searchParams.get("sample") === "patient";

    if (mode === "patient" && isPatientSample) {
      setNotes(SAMPLE_PATIENT_DESCRIPTION);
      return;
    }

    if (mode === "doctor" && isDoctorSample) {
      setNotes(SAMPLE_NOTES);
      return;
    }

    const saved = sessionStorage.getItem("clinical_notes");
    const savedMode = sessionStorage.getItem(MODE_STORAGE_KEY);
    if (saved && savedMode === mode) {
      setNotes(saved);
    } else {
      setNotes("");
    }

    try {
      const sp = localStorage.getItem("saved_profiles");
      if (sp) setSavedProfiles(JSON.parse(sp));

      const sh = localStorage.getItem("search_history");
      if (sh) setSearchHistory(JSON.parse(sh));
    } catch (e) {
      console.error("Failed to load saved data:", e);
    }
  }, [searchParams, mode]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = notes.trim();
    const minLength = mode === "patient" ? 15 : 20;

    if (!trimmed || trimmed.length < minLength) {
      setError(
        mode === "patient"
          ? "Please provide a clinical summary of at least 15 characters."
          : "Please provide clinical notes of at least 20 characters."
      );
      return;
    }

    if (trimmed.length > 10000) {
      setError(
        "Input exceeds the 10,000 character limit. Please shorten the entry and resubmit."
      );
      return;
    }

    try {
      sessionStorage.setItem("clinical_notes", trimmed);
      sessionStorage.setItem(MODE_STORAGE_KEY, mode);
      sessionStorage.removeItem("clinical_profile");
      router.push("/results");
    } catch (err) {
      console.error("Storage error:", err);
      setError("Unable to save input locally. Please check browser storage settings.");
    }
  };

  const isPatient = mode === "patient";

  return (
    <section aria-labelledby="notes-heading">
      <form onSubmit={handleSubmit} noValidate>
        <h2
          id="notes-heading"
          className="font-display text-2xl text-foreground text-pretty mb-2"
        >
          {isPatient ? "Clinical summary" : "Clinical notes"}
        </h2>
        <p className="section-hint mb-6">
          {isPatient
            ? "Include age, diagnosis, prior treatments, location, and treatment objectives. Narrative format is acceptable."
            : "Include age, sex, diagnosis, stage, biomarkers, prior therapies, and location where available."}
        </p>
        <label htmlFor="clinical-notes" className="sr-only">
          {isPatient ? "Clinical summary" : "Patient clinical notes"}
        </label>

        <div className="compose-pane">
          <textarea
            id="clinical-notes"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              isPatient
                ? "Example: I'm 58 and live near Boston. I have stage III HER2-positive breast cancer. I had surgery, chemo, and trastuzumab. Scans look stable. I'm looking for trials for newer HER2 treatments."
                : "Example: 58-year-old woman with stage III HER2-positive breast cancer. Lives in Boston, MA. Prior mastectomy, chemo, and trastuzumab. Looking for trials near home."
            }
            rows={12}
            required
            minLength={isPatient ? 15 : 20}
            maxLength={10000}
            spellCheck={true}
            autoComplete="off"
            data-form-type="other"
            data-1p-ignore
            data-lpignore="true"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "notes-error notes-hint" : "notes-hint"}
            className="notes-field"
          />
        </div>

        <div className="compose-footer">
          <p id="notes-hint">
            {isPatient
              ? "Minimum 15 characters required"
              : "Minimum 20 characters required"}
          </p>
          <span aria-hidden="true">{notes.length.toLocaleString()} / 10,000</span>
        </div>

        {error && (
          <p id="notes-error" role="alert" className="mt-4 text-sm text-destructive font-body">
            {error}
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <button type="submit" className="btn-primary">
            {isPatient ? "Search trials" : "Run search"}
          </button>
          <Link
            href={isPatient ? "/?sample=patient" : "/?sample=1"}
            className="btn-ghost"
          >
            Load sample case
          </Link>
        </div>
      </form>

      {!isPatient && (savedProfiles.length > 0 || searchHistory.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {savedProfiles.length > 0 && (
            <div className="pt-6 divider">
              <h3 className="font-display text-lg text-foreground mb-4 mt-6">
                Saved profiles
              </h3>
              <ul className="space-y-2">
                {savedProfiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.removeItem("clinical_notes");
                        sessionStorage.setItem(MODE_STORAGE_KEY, "doctor");
                        sessionStorage.setItem(
                          "clinical_profile",
                          JSON.stringify(p.profile)
                        );
                        router.push("/results");
                      }}
                      className="text-left w-full py-3 border-b border-border-subtle text-sm transition-colors flex justify-between items-center cursor-pointer hover:text-primary"
                    >
                      <div>
                        <span className="font-bold text-foreground block">
                          {p.name}
                        </span>
                        <span className="text-[10px] text-faint">
                          {p.profile.primaryDiagnosis}{" "}
                          {p.profile.stage ? `(${p.profile.stage})` : ""}
                        </span>
                      </div>
                      <span className="text-[10px] text-primary underline underline-offset-2">
                        Load
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {searchHistory.length > 0 && (
            <div className="pt-6 divider">
              <h3 className="font-display text-lg text-foreground mb-4 mt-6">
                Recent searches
              </h3>
              <ul className="space-y-2">
                {searchHistory.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setNotes(item.notes)}
                      className="text-left w-full py-3 border-b border-border-subtle text-sm transition-colors cursor-pointer hover:text-primary"
                      title="Restore to form"
                    >
                      <span className="text-faint text-[10px] block mb-0.5">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </span>
                      <span className="text-foreground leading-tight text-pretty font-body line-clamp-2">
                        {item.notes}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
