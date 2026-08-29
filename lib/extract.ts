import type { PatientProfile } from "./types";
import { parseLocationFromNotes } from "./location";

// Order matters: more specific terms first so a generic token does not swallow
// a longer phrase (e.g. "lymphoma" before it, "hodgkin"; "colon" vs
// "colorectal"). Single-word entries match anywhere in the narrative.
const CANCER_TYPES = [
  "breast cancer",
  "non-small cell lung",
  "small cell lung",
  "lung cancer",
  "melanoma",
  "non-hodgkin",
  "hodgkin",
  "lymphoma",
  "leukemia",
  "glioblastoma",
  "glioma",
  "colorectal cancer",
  "rectal cancer",
  "colon cancer",
  "prostate cancer",
  "ovarian cancer",
  "pancreatic cancer",
  "hepatocellular",
  "liver cancer",
  "renal cell",
  "kidney cancer",
  "bladder cancer",
  "gastric cancer",
  "stomach cancer",
  "esophageal cancer",
  "endometrial cancer",
  "cervical cancer",
  "head and neck",
  "thyroid cancer",
  "mesothelioma",
  "sarcoma",
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

// Read the polarity of a short receptor token (er, pr). Anchored with
// (?<![a-z]) so "er" is never matched inside "her2", "cancer", etc. The prior
// version used a bare `er\s*-` alternative that matched the hyphen in "HER-2"
// (phantom "ER negative") and, worse, inverted "ER-positive" into negative.
function detectReceptorStatus(
  lower: string,
  token: string
): "positive" | "negative" | null {
  const b = `(?<![a-z])${token}`;
  if (new RegExp(`${b}[\\s\\-]*(?:positive|pos)\\b`, "i").test(lower)) return "positive";
  if (new RegExp(`${b}\\+`, "i").test(lower)) return "positive";
  if (new RegExp(`${b}[\\s\\-]*(?:negative|neg)\\b`, "i").test(lower)) return "negative";
  // Bare "ER-" shorthand is negative, but only when it is not "ER-positive".
  if (new RegExp(`${b}-(?![a-z])`, "i").test(lower)) return "negative";
  return null;
}

function normalizeBiomarkers(rawText: string): string[] {
  const markers: string[] = [];
  const lower = rawText.toLowerCase();

  // HER2: allow an optional separator so "HER2", "HER-2", and "HER 2" all match,
  // and capture negativity (the prior version silently dropped HER2-negative,
  // breaking triple-negative gating from narrative input).
  const her2 = `(?<![a-z])her[\\s\\-]?2`;
  if (
    new RegExp(`${her2}[\\s\\-]*(?:positive|pos)\\b`, "i").test(lower) ||
    new RegExp(`${her2}\\+`, "i").test(lower)
  ) {
    markers.push("HER2 positive");
  } else if (
    new RegExp(`${her2}[\\s\\-]*(?:negative|neg)\\b`, "i").test(lower) ||
    new RegExp(`${her2}-(?![a-z])`, "i").test(lower)
  ) {
    markers.push("HER2 negative");
  } else if (new RegExp(`${her2}\\b`, "i").test(lower)) {
    markers.push("HER2");
  }

  const er = detectReceptorStatus(lower, "er");
  if (er) markers.push(`ER ${er}`);

  const pr = detectReceptorStatus(lower, "pr");
  if (pr) markers.push(`PR ${pr}`);

  // "Triple negative" / TNBC implies the three receptors are negative. Fill in
  // any not already stated explicitly so the triple-negative eligibility gate
  // can evaluate from a plain narrative.
  if (/\btriple[\s\-]?negative\b|\btnbc\b/i.test(lower)) {
    for (const implied of ["ER negative", "PR negative", "HER2 negative"]) {
      const base = implied.split(" ")[0].toLowerCase();
      const already = markers.some(
        (m) => m.toLowerCase() === base || m.toLowerCase().startsWith(`${base} `)
      );
      if (!already) markers.push(implied);
    }
  }

  // Token-boundary matches only. A plain includes() let "alk" match inside
  // "alkaline"/"walk" (phantom ALK driver) and similar substrings elsewhere.
  const extras: Array<{ id: string; re: RegExp }> = [
    { id: "EGFR", re: /\begfr\b/i },
    { id: "ALK", re: /\balk\b/i },
    { id: "BRAF", re: /\bbraf\b/i },
    { id: "KRAS", re: /\bkras\b/i },
    { id: "NRAS", re: /\bnras\b/i },
    { id: "PD-L1", re: /\bpd[\s\-]?l1\b/i },
    { id: "MSI-high", re: /\bmsi[\s\-]?high\b/i },
    { id: "BRCA1", re: /\bbrca1\b/i },
    { id: "BRCA2", re: /\bbrca2\b/i },
    { id: "ROS1", re: /\bros1\b/i },
    { id: "NTRK", re: /\bntrk\b/i },
  ];

  for (const marker of extras) {
    if (marker.re.test(lower)) markers.push(marker.id);
  }

  return [...new Set(markers)];
}

function extractPriorTreatments(rawText: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /\b(mastectomy|lumpectomy|chemotherapy|chemo|immunotherapy|radiation|radiotherapy|trastuzumab|carboplatin|paclitaxel|pembrolizumab|nivolumab|tamoxifen|anastrozole|surgery|targeted therapy)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of rawText.matchAll(pattern)) {
      let value = match[1].trim().toLowerCase();
      if (value === "chemo") value = "chemotherapy";
      if (value.length > 2) found.add(value);
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

  const ageMatch =
    text.match(/\b(\d{1,3})[\s-]*(?:year|yr|y\.?o|years old)\b/) ||
    text.match(/\b(?:i(?:'m| am)|age[d:]?)\s*(\d{1,3})\b/);
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
