"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ResultsDashboard from "@/components/ResultsDashboard";
import LoadingProgress from "@/components/LoadingProgress";
import { getResultsAction, getResultsByProfileAction } from "@/app/actions/match";
import type { MatchResponse, PatientProfile } from "@/lib/types";

export default function ResultsPage() {
  const [data, setData] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
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

    startTransition(async () => {
      try {
        if (savedProfileJson) {
          const profile = JSON.parse(savedProfileJson) as PatientProfile;
          const result = await getResultsByProfileAction(profile);
          setData(result);
        } else if (notes) {
          const result = await getResultsAction(notes);
          setData(result);

          // Save search history
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
        setError("An error occurred while matching trials. Please check your notes or profile and try again.");
      }
    });
  }, [router]);

  const handleProfileUpdate = (updatedProfile: PatientProfile) => {
    startUpdateTransition(async () => {
      try {
        const result = await getResultsByProfileAction(updatedProfile);
        setData(result);
      } catch (err) {
        console.error(err);
        // Show non-blocking error or set error state
        alert("Failed to update matches. Please verify your profile fields.");
      }
    });
  };

  if (error) {
    return (
      <div className="space-y-6">
        <div className="info-card border-destructive/30 bg-destructive/5 text-destructive p-6 rounded-lg">
          <p className="font-semibold text-lg">Something went wrong</p>
          <p className="mt-2 text-sm opacity-90">{error}</p>
        </div>
        <Link href="/" className="btn-primary inline-block">
          Go back
        </Link>
      </div>
    );
  }

  if (isPending || !data) {
    return <LoadingProgress />;
  }

  return (
    <div>
      <ResultsDashboard 
        data={data} 
        onProfileUpdate={handleProfileUpdate} 
        isUpdating={isUpdating} 
      />
      <div className="mt-10 pt-6 border-t border-border-subtle">
        <Link href="/" className="btn-ghost">
          Start a new search
        </Link>
      </div>
    </div>
  );
}
