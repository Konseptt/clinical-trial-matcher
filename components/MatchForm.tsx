"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SAMPLE_NOTES } from "@/lib/sample-notes";
import type { PatientProfile } from "@/lib/types";

export default function MatchForm() {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<Array<{ id: string; name: string; profile: PatientProfile }>>([]);
  const [searchHistory, setSearchHistory] = useState<Array<{ id: string; notes: string; timestamp: number }>>([]);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Load default notes if sample query is present or check sessionStorage, and load local storage
  useEffect(() => {
    const isSample = searchParams.get("sample") === "1";
    if (isSample) {
      setNotes(SAMPLE_NOTES);
    } else {
      const saved = sessionStorage.getItem("clinical_notes");
      if (saved) {
        setNotes(saved);
      }
    }

    try {
      const sp = localStorage.getItem("saved_profiles");
      if (sp) setSavedProfiles(JSON.parse(sp));

      const sh = localStorage.getItem("search_history");
      if (sh) setSearchHistory(JSON.parse(sh));
    } catch (e) {
      console.error("Failed to load saved data:", e);
    }
  }, [searchParams]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = notes.trim();

    if (!trimmed || trimmed.length < 20) {
      setError("Please provide at least a few sentences of patient notes (20 characters minimum).");
      return;
    }

    if (trimmed.length > 10000) {
      setError("Your notes exceed the maximum limit of 10,000 characters. Please shorten them and try again.");
      return;
    }

    try {
      sessionStorage.setItem("clinical_notes", trimmed);
      router.push("/results");
    } catch (err) {
      console.error("Storage error:", err);
      setError("Failed to save patient notes. Please check browser settings.");
    }
  };

  return (
    <section aria-labelledby="notes-heading">
      <form onSubmit={handleSubmit} noValidate className="info-card">
        <h2
          id="notes-heading"
          className="font-display text-xl text-foreground text-pretty mb-1.5"
        >
          Patient notes
        </h2>
        <p className="section-hint mb-5">
          Include age, sex, diagnosis, cancer stage, biomarkers, past
          treatments, and city or country if you know it. More detail usually
          means better matches.
        </p>
        <label htmlFor="clinical-notes" className="sr-only">
          Patient clinical notes
        </label>

        <textarea
          id="clinical-notes"
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Example: 58-year-old woman with stage III HER2-positive breast cancer. Lives in Boston, MA. Prior mastectomy, chemo, and trastuzumab. Looking for trials near home."
          rows={12}
          required
          minLength={20}
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

        <p id="notes-hint" className="section-hint mt-2">
          At least a few sentences (20 characters minimum, 10,000 characters maximum).
        </p>

        {error && (
          <div
            id="notes-error"
            role="alert"
            className="mt-4 info-card border-destructive/30 bg-destructive/5"
          >
            <p className="font-body text-sm text-destructive font-medium">
              Please check your entry
            </p>
            <p className="section-hint mt-1 text-destructive/80">
              {error}
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4">
          <button type="submit" className="btn-primary">
            Find matching trials
          </button>
          <Link href="/?sample=1" className="btn-ghost">
            Try an example case
          </Link>
        </div>
      </form>

      {(savedProfiles.length > 0 || searchHistory.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          {savedProfiles.length > 0 && (
            <div className="info-card">
              <h3 className="font-display text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                📁 Saved Patient Profiles
              </h3>
              <ul className="space-y-2">
                {savedProfiles.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        sessionStorage.removeItem("clinical_notes");
                        sessionStorage.setItem("clinical_profile", JSON.stringify(p.profile));
                        router.push("/results");
                      }}
                      className="text-left w-full hover:bg-muted p-2 rounded border border-border-subtle text-xs transition-colors flex justify-between items-center bg-surface cursor-pointer"
                    >
                      <div>
                        <span className="font-bold text-foreground block">{p.name}</span>
                        <span className="text-[10px] text-faint">
                          {p.profile.primaryDiagnosis} {p.profile.stage ? `(${p.profile.stage})` : ""}
                        </span>
                      </div>
                      <span className="text-[10px] text-primary font-semibold">Load Profile →</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {searchHistory.length > 0 && (
            <div className="info-card">
              <h3 className="font-display text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                ⏱️ Recent Searches
              </h3>
              <ul className="space-y-2">
                {searchHistory.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setNotes(item.notes);
                      }}
                      className="text-left w-full hover:bg-muted p-2 rounded border border-border-subtle text-xs transition-colors bg-surface cursor-pointer"
                      title="Click to populate notes"
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
