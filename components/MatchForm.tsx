"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SAMPLE_NOTES } from "@/lib/sample-notes";

export default function MatchForm() {
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Load default notes if sample query is present or check sessionStorage
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
      <div className="info-card mb-4">
        <h2
          id="notes-heading"
          className="font-display text-xl text-foreground text-pretty"
        >
          Patient notes
        </h2>
        <p className="section-hint mt-1.5">
          Include age, sex, diagnosis, cancer stage, biomarkers, past
          treatments, and city or country if you know it. More detail usually
          means better matches.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
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
          <Link href="/?sample=1" className="btn-ghost sm:ml-2">
            Try an example case
          </Link>
        </div>
      </form>
    </section>
  );
}
