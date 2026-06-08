import { extractPatientProfile } from "@/lib/extract";
import { isNvidiaConfigured, nvidiaChatCompletion } from "@/lib/nvidia";
import type { PatientLocation, PatientProfile } from "@/lib/types";

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model response");
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeSex(value: unknown): PatientProfile["sex"] {
  const sex = asString(value).toLowerCase();
  if (sex === "male" || sex === "female") return sex;
  return "unknown";
}

function normalizeLocation(value: unknown): PatientLocation | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const city = asString(record.city) || null;
  const state = asString(record.state) || null;
  const country = asString(record.country) || null;
  if (!city && !state && !country) return null;
  return { city, state, country };
}

function normalizeMetastatic(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function coercePatientProfile(
  parsed: unknown,
  fallback: PatientProfile
): PatientProfile {
  if (!parsed || typeof parsed !== "object") {
    return fallback;
  }

  const record = parsed as Record<string, unknown>;
  const ageRaw = record.age;
  const age =
    typeof ageRaw === "number" && Number.isFinite(ageRaw)
      ? Math.min(Math.max(Math.round(ageRaw), 0), 120)
      : fallback.age;

  const primaryDiagnosis =
    asString(record.primaryDiagnosis) || fallback.primaryDiagnosis;

  return {
    age,
    sex: normalizeSex(record.sex) ?? fallback.sex,
    primaryDiagnosis,
    stage: asString(record.stage) || fallback.stage,
    biomarkers: asStringArray(record.biomarkers, 15).length
      ? asStringArray(record.biomarkers, 15)
      : fallback.biomarkers,
    priorTreatments: asStringArray(record.priorTreatments, 20).length
      ? asStringArray(record.priorTreatments, 20)
      : fallback.priorTreatments,
    priorTreatmentsTimeline: fallback.priorTreatmentsTimeline,
    location: normalizeLocation(record.location) ?? fallback.location,
    hasMetastaticDisease:
      normalizeMetastatic(record.hasMetastaticDisease) ??
      fallback.hasMetastaticDisease,
    interests: asStringArray(record.interests, 10).length
      ? asStringArray(record.interests, 10)
      : fallback.interests,
  };
}

const PROFILE_JSON_SCHEMA = `{
  "age": number or null,
  "sex": "male" | "female" | "unknown",
  "primaryDiagnosis": string,
  "stage": string or null,
  "biomarkers": string[],
  "priorTreatments": string[],
  "location": { "city": string or null, "state": string or null, "country": string or null } or null,
  "hasMetastaticDisease": boolean or null,
  "interests": string[]
}`;

async function extractProfileWithPrompt(
  rawText: string,
  systemPrompt: string,
  userPrompt: string
): Promise<PatientProfile> {
  const fallback = extractPatientProfile(rawText);

  if (!isNvidiaConfigured()) {
    throw new Error("PATIENT_MODE_AI_UNAVAILABLE");
  }

  const content = await nvidiaChatCompletion({
    maxTokens: 1200,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const parsed = extractJsonObject(content);
  return coercePatientProfile(parsed, fallback);
}

export async function extractPatientProfilePatientMode(
  rawText: string
): Promise<PatientProfile> {
  return extractProfileWithPrompt(
    rawText,
    "Extract structured clinical eligibility variables from patient narrative summaries. Return only valid JSON matching the schema. Use standard clinical terminology. No markdown or commentary.",
    `Patient clinical summary:
${rawText}

Return JSON with this schema:
${PROFILE_JSON_SCHEMA}`
  );
}
