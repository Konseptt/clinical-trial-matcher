import type { PatientProfile } from "./types";
import { parseLocationFromNotes } from "./location";

const CANCER_TYPES = [
  "breast cancer",
  "lung cancer",
  "melanoma",
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
  "hodgkin",
  "non-hodgkin",
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

  const priorTreatmentsTimeline = priorTreatments.map(name => ({
    name,
    ongoing: false
  }));

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

export async function extractPatientProfileAI(rawText: string): Promise<PatientProfile> {
  const apiKey = process.env.NVIDIA_API_KEY || "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";
  
  const prompt = `You are a clinical note parser. Extract patient characteristics from the provided clinical notes and return a JSON object matching this schema:
{
  "age": number or null,
  "sex": "male" | "female" | "unknown",
  "primaryDiagnosis": string,
  "stage": string or null,
  "biomarkers": [string],
  "priorTreatments": [string],
  "location": {
    "city": string or null,
    "state": string or null,
    "country": string or null
  } or null,
  "hasMetastaticDisease": boolean or null,
  "interests": [string]
}

Clinical Notes:
"${rawText}"

Important rules:
1. "primaryDiagnosis" should be a concise medical term (e.g. "breast cancer", "NSCLC").
2. "location" must include city, state, or country if mentioned.
3. Only return the raw JSON object. Do not explain anything.`;

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
            content: "You are a clinical notes extractor. You only respond with JSON matching the requested schema.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.2,
        top_p: 0.7,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      throw new Error(`NVIDIA API response error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    // Clean potential markdown blocks
    const jsonStr = content.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, "$1").trim();
    const parsed = JSON.parse(jsonStr) as PatientProfile;
    
    // Validate required fields and map defaults
    const finalPriorTreatments = Array.isArray(parsed.priorTreatments) ? parsed.priorTreatments : [];
    const parsedTimeline = (parsed as any).priorTreatmentsTimeline;
    const priorTreatmentsTimeline = Array.isArray(parsedTimeline)
      ? parsedTimeline.map((item: any) => ({
          name: item.name || "",
          startDate: item.startDate || undefined,
          endDate: item.endDate || undefined,
          ongoing: typeof item.ongoing === "boolean" ? item.ongoing : false
        }))
      : finalPriorTreatments.map((name: string) => ({
          name,
          ongoing: false
        }));

    return {
      age: typeof parsed.age === "number" ? parsed.age : null,
      sex: ["male", "female", "unknown"].includes(parsed.sex) ? parsed.sex : "unknown",
      primaryDiagnosis: parsed.primaryDiagnosis || "unspecified condition",
      stage: parsed.stage || null,
      biomarkers: Array.isArray(parsed.biomarkers) ? parsed.biomarkers : [],
      priorTreatments: finalPriorTreatments,
      priorTreatmentsTimeline,
      location: parsed.location && (parsed.location.city || parsed.location.state || parsed.location.country)
        ? {
            city: parsed.location.city || null,
            state: parsed.location.state || null,
            country: parsed.location.country || null,
          }
        : null,
      hasMetastaticDisease: typeof parsed.hasMetastaticDisease === "boolean" ? parsed.hasMetastaticDisease : null,
      interests: Array.isArray(parsed.interests) ? parsed.interests : [],
    };
  } catch (error) {
    console.error("Failed to extract patient profile with AI, falling back to regex parser:", error);
    return extractPatientProfile(rawText);
  }
}
