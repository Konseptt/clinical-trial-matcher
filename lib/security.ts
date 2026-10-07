import type { PatientLocation, PatientProfile, TreatmentHistory } from "@/lib/types";

const MAX_FIELD = 500;
const MAX_ARRAY_ITEMS = 30;
const MAX_ARRAY_ITEM = 200;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown, max = MAX_FIELD): string | null {
  return typeof value === "string" && value.length <= max && value.trim()
    ? value.trim()
    : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) return [];
  return value.every((item) => typeof item === "string" && item.length <= MAX_ARRAY_ITEM)
    ? value.map((item) => item.trim()).filter(Boolean)
    : [];
}

function location(value: unknown): PatientLocation | null {
  const item = record(value);
  if (!item) return null;
  const city = text(item.city, 120);
  const state = text(item.state, 120);
  const country = text(item.country, 120);
  return city || state || country ? { city, state, country } : null;
}

function timeline(value: unknown): TreatmentHistory[] {
  if (!Array.isArray(value) || value.length > MAX_ARRAY_ITEMS) return [];
  return value.flatMap((item) => {
    const entry = record(item);
    const name = text(entry?.name, MAX_ARRAY_ITEM);
    if (!name) return [];
    return [{
      name,
      startDate: text(entry?.startDate, 20) ?? undefined,
      endDate: text(entry?.endDate, 20) ?? undefined,
      ongoing: entry?.ongoing === true,
      reasonDiscontinued: text(entry?.reasonDiscontinued, MAX_ARRAY_ITEM) ?? undefined,
    }];
  });
}

export function validatePatientProfile(value: unknown): PatientProfile | null {
  const item = record(value);
  const primaryDiagnosis = text(item?.primaryDiagnosis);
  if (!item || !primaryDiagnosis) return null;

  const age = item.age === null || item.age === undefined
    ? null
    : typeof item.age === "number" && Number.isInteger(item.age) && item.age >= 0 && item.age <= 120
      ? item.age
      : null;
  const sex = item.sex === "male" || item.sex === "female" ? item.sex : "unknown";

  return {
    age,
    sex,
    primaryDiagnosis,
    subtype: text(item.subtype),
    diseaseDuration: text(item.diseaseDuration),
    symptoms: stringList(item.symptoms),
    currentTreatment: text(item.currentTreatment),
    previousTreatments: [],
    recentDiseaseActivity: text(item.recentDiseaseActivity),
    mriFindings: text(item.mriFindings),
    priorAdvancedTherapies: null,
    stage: text(item.stage, 120),
    biomarkers: stringList(item.biomarkers),
    priorTreatments: stringList(item.priorTreatments),
    location: location(item.location),
    hasMetastaticDisease: typeof item.hasMetastaticDisease === "boolean" ? item.hasMetastaticDisease : null,
    interests: stringList(item.interests),
    priorTreatmentsTimeline: timeline(item.priorTreatmentsTimeline),
  };
}

export function boundedText(value: unknown, max: number): string | null {
  return text(value, max);
}