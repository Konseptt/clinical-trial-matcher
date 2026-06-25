"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ResultsDashboard from "@/components/ResultsDashboard";
import LoadingProgress from "@/components/LoadingProgress";
import { getResultsAction, getResultsByProfileAction } from "@/app/actions/match";
import { MODE_STORAGE_KEY, normalizeAppMode } from "@/lib/mode";
import type { AppMode, MatchResponse, PatientProfile } from "@/lib/types";

export default function ResultsPage() {
  const [data, setData] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<AppMode>("doctor");
  const [isPending, startTransition] = useTransition();
  const [isUpdating, startUpdateTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const notes = sessionStorage.getItem("clinical_notes");
    const savedProfileJson = sessionStorage.getItem("clinical_profile");

    if (!notes && !savedProfileJson) {
      router.push("/");
      return;
    }

    const storedMode = normalizeAppMode(sessionStorage.getItem(MODE_STORAGE_KEY));
    // Client-only sessionStorage read on mount; cannot run during SSR render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMode(storedMode);

    startTransition(async () => {
      try {
        if (savedProfileJson) {
          const profile = JSON.parse(savedProfileJson) as PatientProfile;
          const result = await getResultsByProfileAction(profile);
          setData({ ...result, mode: "doctor" });
        } else if (notes) {
          const result = await getResultsAction(notes, storedMode);
          setData(result);

          try {
            const history = localStorage.getItem("search_history");
            let items = [];
            if (history) {
              items = JSON.parse(history);
            }
            if (!items.some((item: any) => item.notes.trim() === notes.trim())) {
              const updated = [
                { id: Math.random().toString(36).substring(2, 9), notes, timestamp: Date.now() },
                ...items
              ].slice(0, 8);
              localStorage.setItem("search_history", JSON.stringify(updated));
            }
          } catch (e) {
            console.error("Failed to save search history:", e);
          }
        }
      } catch (err) {
        console.error(err);
        setError(
          err instanceof Error
            ? err.message
            : "The trial search could not be completed. Please verify your input and try again."
        );
      }
    });
  }, [router]);

  const handleProfileUpdate = (updatedProfile: PatientProfile) => {
    startUpdateTransition(async () => {
      try {
        const result = await getResultsByProfileAction(updatedProfile);
        // Profile-based search defaults to doctor mode server-side; keep the
        // view's current mode so the label does not silently flip on edit.
        setData({ ...result, mode });
      } catch (err) {
        console.error(err);
        alert("Unable to refresh results. Please verify the patient profile fields.");
      }
    });
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div className="max-w-lg">
          <p className="font-display text-2xl text-foreground">Search could not be completed</p>
          <p className="mt-3 text-sm text-destructive font-body">{error}</p>
        </div>
        <Link href="/" className="btn-primary inline-block">
          Return to search
        </Link>
      </div>
    );
  }

  if (isPending || !data) {
    return <LoadingProgress mode={mode} />;
  }

  return (
    <div className="w-full">
      <ResultsDashboard 
        data={data} 
        onProfileUpdate={handleProfileUpdate} 
        isUpdating={isUpdating} 
      />
    </div>
  );
}
