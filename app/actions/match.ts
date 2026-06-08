"use server";

import { runMatchPipeline, runMatchPipelineByProfile } from "@/lib/match";
import type { MatchResponse, PatientProfile } from "@/lib/types";

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

export async function getResultsByProfileAction(profile: PatientProfile): Promise<MatchResponse> {
  try {
    return await runMatchPipelineByProfile(profile);
  } catch (error) {
    console.error("Clinical trial match by profile failure:", error);
    throw new Error("We were unable to complete the trial search at this time.");
  }
}

export async function getSimplifiedSummaryAction(trialId: string, summary: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY || "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";
  const prompt = `You are a clinical trial simplification assistant. Translate the following clinical trial summary into layperson terms (approximately a 6th-grade reading level). Keep it concise (2-4 sentences max), focus on what the trial is testing and why, and format it as a clean paragraph or simple bullet points. Do not include markdown headers, greetings, or explanations.
  
Clinical Trial Summary:
"${summary}"`;

  try {
    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "meta/llama-3.3-70b-instruct",
        messages: [
          {
            role: "system",
            content: "You simplify clinical trials for patients.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3,
        top_p: 0.7,
        max_tokens: 512,
      }),
    });

    if (!response.ok) {
      throw new Error(`NVIDIA API response error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "No translation generated.";
  } catch (error) {
    console.error("Failed to simplify summary:", error);
    return "We were unable to generate a simplified summary at this time.";
  }
}
