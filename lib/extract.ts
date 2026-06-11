import type { PatientProfile } from "./types";
import { parseLocationFromNotes } from "./location";

const CANCER_TYPES = [
  "breast cancer",
  "lung cancer",
  "melanoma",
  // More specific terms first: "lymphoma" would otherwise swallow
  // "non-hodgkin lymphoma" / "hodgkin lymphoma" before they are reached.
  "non-hodgkin",
  "hodgkin",
  "lymphoma",
  "leukemia",
  "glioblastoma",
  "colon cancer",
  "prostate cancer",
  "ovarian cancer",
  "pancreatic cancer",
  "nsclc",
  "sclc",
  "multiple myeloma",
];

function findFirstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function extractDiagnosis(rawText: string): string {
  const lower = rawText.toLowerCase();

  for (const cancerType of CANCER_TYPES) {
    if (lower.includes(cancerType)) {
      const modifierMatch = rawText.match(
        new RegExp(
          `((?:her2|er|pr|egfr|alk|braf|kras)[\\-\\+\\s]*(?:positive|negative|\\+|\\-)?\\s*)?${cancerType.replace(/\s+/g, "\\s+")}`,
          "i"
        )
      );
      if (modifierMatch?.[0]) {
        return modifierMatch[0]
          .replace(/\bstage\s+[ivx0-9]+[abc]?\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
      }
      return cancerType;
    }
  }

  const diagnosisPatterns = [
    /(?:diagnosed with|diagnosis of|history of|presents with)\s+(.+?)(?:\.|,|;|\n)/i,
    /(?:primary diagnosis|condition):\s*(.+?)(?:\.|,|;|\n)/i,
  ];

  const found = findFirstMatch(rawText, diagnosisPatterns);
  if (!found) return "unspecified condition";

  return found
    .replace(/^\s*stage\s+[ivx0-9]+[abc]?\s+/i, "")
    .replace(/\bstage\s+[ivx0-9]+[abc]?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBiomarkers(rawText: string): string[] {
  const markers: string[] = [];
  const lower = rawText.toLowerCase();

  if (/her2[\s\-\+]*positive|her2\+/i.test(lower)) markers.push("HER2 positive");
  else if (/\bher2\b/i.test(lower)) markers.push("HER2");

  if (/er[\s\-\+]*negative|er\s*-/i.test(lower)) markers.push("ER negative");
  else if (/er[\s\-\+]*positive|er\s*\+/i.test(lower)) markers.push("ER positive");

  if (/pr[\s\-\+]*negative|pr\s*-/i.test(lower)) markers.push("PR negative");
  else if (/pr[\s\-\+]*positive|pr\s*\+/i.test(lower)) markers.push("PR positive");

  const extras = [
    "egfr",
    "alk",
    "braf",
    "kras",
    "pdl1",
    "pd-l1",
    "msi-high",
    "brca1",
    "brca2",
    "ros1",
    "ntrk",
  ];

  for (const marker of extras) {
    if (lower.includes(marker.replace("-", "")) || lower.includes(marker)) {
      markers.push(marker.toUpperCase());
    }
  }

  return [...new Set(markers)];
}

function extractPriorTreatments(rawText: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\b(mastectomy|lumpectomy|chemotherapy|immunotherapy|radiation|radiotherapy|trastuzumab|carboplatin|paclitaxel|pembrolizumab|nivolumab|tamoxifen|anastrozole|surgery|targeted therapy)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of rawText.matchAll(pattern)) {
      const value = match[1].trim();
      if (value.length > 2) found.add(value.toLowerCase());
    }
  }

  return Array.from(found).map(
    (t) => t.charAt(0).toUpperCase() + t.slice(1)
  );
}

function buildTreatmentTimeline(
  rawText: string,
  treatments: string[]
): { name: string; ongoing: boolean; endDate?: string }[] {
  const now = Date.now();
  const DAY_MS = 1000 * 60 * 60 * 24;
  // Scope cues to the sentence mentioning the treatment. A blind character
  // window bleeds into adjacent sentences, so "completed radiation 6 months
  // ago. Currently on trastuzumab" would mark radiation as ongoing.
  const sentences = rawText.split(/(?<=[.;\n])\s+/);

  return treatments.map((name) => {
    const key = name.toLowerCase();
    const sentence =
      sentences.find((s) => s.toLowerCase().includes(key))?.toLowerCase() ?? "";

    if (/\b(ongoing|currently|current|continues|still on|maintenance)\b/.test(sentence)) {
      return { name, ongoing: true };
    }

    // Relative end date, e.g. "completed chemotherapy 6 months ago".
    const rel = sentence.match(/(\d+)\s*(day|week|month|year)s?\s*ago/);
    if (rel) {
      const value = parseInt(rel[1], 10);
      const unit = rel[2];
      const days =
        unit === "day"
          ? value
          : unit === "week"
          ? value * 7
          : unit === "month"
          ? value * 30
          : value * 365;
      const endDate = new Date(now - days * DAY_MS).toISOString().slice(0, 10);
      return { name, ongoing: false, endDate };
    }

    // No temporal info: leave undated so washout resolves to "unknown".
    return { name, ongoing: false };
  });
}

export function extractPatientProfile(rawText: string): PatientProfile {
  const normalizedText = rawText.replace(/\s+/g, " ");
  const text = normalizedText.toLowerCase();

  const ageMatch = text.match(/\b(\d{1,3})[\s-]*(?:year|yr|y\.?o|years old)\b/);
  const age = ageMatch ? Math.min(parseInt(ageMatch[1], 10), 120) : null;

  let sex: PatientProfile["sex"] = "unknown";
  if (/\b(male|man|m\/f.*\bm\b|he\/him|his\b)/.test(text)) sex = "male";
  else if (/\b(female|woman|f\/m|she\/her|hers\b)/.test(text)) sex = "female";

  const primaryDiagnosis = extractDiagnosis(normalizedText);

  const stagePatterns = [
    /\bstage\s+(i{1,3}[abc]?|iv[abc]?|0|[1-4][abc]?)\b/i,
    /\b(staging|classified as)\s+(i{1,3}[abc]?|iv[abc]?)\b/i,
  ];
  const stage = findFirstMatch(normalizedText, stagePatterns);

  const biomarkers = normalizeBiomarkers(normalizedText);
  const priorTreatments = extractPriorTreatments(normalizedText);
  const location = parseLocationFromNotes(normalizedText);

  function extractMetastaticStatus(): boolean | null {
    if (
      /\bno evidence of metastatic\b/i.test(normalizedText) ||
      /\bno metastatic\b/i.test(normalizedText) ||
      /\bwithout metastas/i.test(normalizedText) ||
      /\bnon[\s-]?metastatic\b/i.test(normalizedText)
    ) {
      return false;
    }

    if (
      /\b(leptomeningeal|brain metastas|distant metastas)\b/i.test(normalizedText) ||
      /\bmetastatic (?:disease|breast|cancer|lesions)\b/i.test(normalizedText) ||
      /\bstage\s+iv\b/i.test(normalizedText)
    ) {
      return true;
    }

    return null;
  }

  const interests: string[] = [];
  if (/her2[\s-]?targeted|anti[\s-]?her2|trastuzumab|pertuzumab|t[\s-]?dm1|t[\s-]?dxt/i.test(normalizedText)) {
    interests.push("HER2-targeted therapy");
  }
  if (/immunotherapy|checkpoint/i.test(normalizedText)) {
    interests.push("immunotherapy");
  }

  const priorTreatmentsTimeline = buildTreatmentTimeline(
    normalizedText,
    priorTreatments
  );

  return {
    age,
    sex,
    primaryDiagnosis,
    stage,
    biomarkers,
    priorTreatments,
    priorTreatmentsTimeline,
    location,
    hasMetastaticDisease: extractMetastaticStatus(),
    interests,
  };
}
