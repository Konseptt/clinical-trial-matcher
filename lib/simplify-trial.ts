import { stripEmDashes } from "@/lib/format";
import { isNvidiaConfigured, nvidiaChatCompletion } from "@/lib/nvidia";
import type { PatientProfile, SimplifiedTrialGuide } from "@/lib/types";

export interface SimplifyTrialInput {
  trialTitle: string;
  trialSummary: string;
  trialPhase: string;
  trialStatus: string;
  matchScore: number;
  profile: Pick<
    PatientProfile,
    | "primaryDiagnosis"
    | "stage"
    | "age"
    | "sex"
    | "biomarkers"
    | "priorTreatments"
    | "location"
  >;
}

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in simplify response");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function asString(value: unknown, fallback = ""): string {
  const raw = typeof value === "string" ? value.trim() : fallback;
  return stripEmDashes(raw);
}

function asStringArray(value: unknown, max = 5): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => stripEmDashes(item.trim()))
    .filter(Boolean)
    .slice(0, max);
}

function coerceGuide(parsed: unknown, fallbackHeadline: string): SimplifiedTrialGuide {
  if (!parsed || typeof parsed !== "object") {
    return {
      headline: fallbackHeadline,
      goodFit: "",
      studyBasics: [],
      whatToExpect: [],
      goodToKnow: "",
      askYourDoctor: [],
    };
  }

  const record = parsed as Record<string, unknown>;
  return {
    headline: asString(record.headline, fallbackHeadline),
    goodFit: asString(record.goodFit),
    studyBasics: asStringArray(record.studyBasics, 4),
    whatToExpect: asStringArray(record.whatToExpect, 4),
    goodToKnow: asString(record.goodToKnow),
    askYourDoctor: asStringArray(record.askYourDoctor, 3),
  };
}

function buildPatientContext(profile: SimplifyTrialInput["profile"]): string {
  const lines = [
    `Diagnosis: ${profile.primaryDiagnosis}`,
    profile.stage ? `Stage: ${profile.stage}` : null,
    profile.age ? `Age: ${profile.age}` : null,
    profile.sex !== "unknown" ? `Sex: ${profile.sex}` : null,
    profile.biomarkers.length > 0
      ? `Biomarkers: ${profile.biomarkers.join(", ")}`
      : null,
    profile.priorTreatments.length > 0
      ? `Prior treatments: ${profile.priorTreatments.slice(0, 5).join(", ")}`
      : null,
    profile.location?.city || profile.location?.country
      ? `Location: ${[profile.location.city, profile.location.state, profile.location.country]
          .filter(Boolean)
          .join(", ")}`
      : null,
  ].filter(Boolean);

  return lines.join("\n");
}

const GUIDE_JSON_SCHEMA = `{
  "headline": "One sentence describing the study objective (max 25 words)",
  "goodFit": "1-2 sentences on clinical relevance for this patient",
  "studyBasics": ["3-4 bullets: eligibility, intervention, phase if known"],
  "whatToExpect": ["2-3 bullets: visits, duration, procedures if stated in source"],
  "goodToKnow": "One sentence on limitations, risks, or eligibility confirmation requirements",
  "askYourDoctor": ["2 consultation questions specific to this patient and trial"]
}`;

export async function generateSimplifiedTrialGuide(
  input: SimplifyTrialInput
): Promise<SimplifiedTrialGuide> {
  if (!isNvidiaConfigured()) {
    throw new Error("PATIENT_MODE_AI_UNAVAILABLE");
  }

  const content = await nvidiaChatCompletion({
    maxTokens: 750,
    temperature: 0.25,
    messages: [
      {
        role: "system",
        content: `Prepare patient-facing oncology consultation materials.
Rules:
- Use professional language at an accessible reading level. Define medical terms briefly.
- Do not use em dashes or en dashes. Use commas, periods, or "and" instead.
- Do not diagnose, recommend enrollment, or imply treatment outcomes.
- State uncertainties directly. Eligibility requires physician confirmation.
- Personalize "goodFit" and "askYourDoctor" to the patient context.
- Return only valid JSON matching the schema. No markdown.`,
      },
      {
        role: "user",
        content: `Create a patient-facing trial summary.

Patient context:
${buildPatientContext(input.profile)}

Trial match score: ${input.matchScore}% (estimate only, not a guarantee of eligibility)
Trial phase: ${input.trialPhase}
Recruitment status: ${input.trialStatus}
Trial title: ${input.trialTitle}
Trial source text: ${input.trialSummary}

Return JSON:
${GUIDE_JSON_SCHEMA}`,
      },
    ],
  });

  const parsed = extractJsonObject(content);
  const guide = coerceGuide(
    parsed,
    "This study is evaluating a treatment approach for patients with this diagnosis."
  );

  if (!guide.goodFit && guide.studyBasics.length === 0) {
    throw new Error("Empty simplify response");
  }

  return guide;
}
