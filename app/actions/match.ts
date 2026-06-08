"use server";

import { runMatchPipeline } from "@/lib/match";
import type { MatchResponse } from "@/lib/types";

export async function getResultsAction(notes: string): Promise<MatchResponse> {
  const trimmedNotes = String(notes ?? "").trim();

  if (!trimmedNotes || trimmedNotes.length < 20) {
    throw new Error("Please provide at least a few sentences of patient notes (20 characters minimum).");
  }

  if (trimmedNotes.length > 10000) {
    throw new Error("Your notes exceed the maximum limit of 10,000 characters. Please shorten them and try again.");
  }

  try {
    return await runMatchPipeline(trimmedNotes);
  } catch (error) {
    console.error("Clinical trial match pipeline failure:", error);
    throw new Error("We were unable to complete the trial search at this time.");
  }
}
