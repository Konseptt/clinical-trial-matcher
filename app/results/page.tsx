"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ResultsDashboard from "@/components/ResultsDashboard";
import LoadingProgress from "@/components/LoadingProgress";
import { getResultsAction } from "@/app/actions/match";
import type { MatchResponse } from "@/lib/types";

export default function ResultsPage() {
  const [data, setData] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const notes = sessionStorage.getItem("clinical_notes");
    if (!notes) {
      router.push("/");
      return;
    }

    startTransition(async () => {
      try {
        const result = await getResultsAction(notes);
        setData(result);
      } catch (err) {
        console.error(err);
        setError("An error occurred while matching trials. Please check your notes and try again.");
      }
    });
  }, [router]);

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
      <ResultsDashboard data={data} />
      <div className="mt-10 pt-6 border-t border-border-subtle">
        <Link href="/" className="btn-ghost">
          Start a new search
        </Link>
      </div>
    </div>
  );
}
