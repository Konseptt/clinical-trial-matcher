import type { PatientProfile } from "./types";

function findFirstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function findAllMatches(text: string, patterns: RegExp[]): string[] {
  const found = new Set<string>();
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(globalPattern)) {
      if (match[1]) found.add(match[1].trim());
    }
  }
  return Array.from(found);
}

export function extractPatientProfile(rawText: string): PatientProfile {
  const text = rawText.toLowerCase();

  const ageMatch = text.match(/\b(\d{1,3})[\s-]*(?:year|yr|y\.?o|years old)\b/);
  const age = ageMatch ? Math.min(parseInt(ageMatch[1], 10), 120) : null;

  let sex: PatientProfile["sex"] = "unknown";
  if (/\b(male|man|m\/f.*\bm\b|he\/him|his\b)/.test(text)) sex = "male";
  else if (/\b(female|woman|f\/m|she\/her|hers\b)/.test(text)) sex = "female";

  const diagnosisPatterns = [
    /(?:diagnosed with|diagnosis of|history of|presents with)\s+([a-z][\w\s\-\/]+?)(?:\.|,|;|\s+stage|\s+at\s+)/i,
    /(?:primary diagnosis|condition):\s*([a-z][\w\s\-\/]+?)(?:\.|,|;)/i,
    /\b(breast cancer|lung cancer|melanoma|lymphoma|leukemia|glioblastoma|colon cancer|prostate cancer|ovarian cancer|pancreatic cancer|nsclc|sclc|multiple myeloma|hodgkin|non-hodgkin)\b/i,
  ];
  const primaryDiagnosis =
    findFirstMatch(rawText, diagnosisPatterns) ?? "unspecified condition";

  const stagePatterns = [
    /\bstage\s+(i{1,3}[abc]?|iv[abc]?|0|[1-4][abc]?)\b/i,
    /\b(staging|classified as)\s+(i{1,3}[abc]?|iv[abc]?)\b/i,
  ];
  const stage = findFirstMatch(rawText, stagePatterns);

  const biomarkerPatterns = [
    /\b(her2[\-\+]?(?:positive|negative|\+|\-)?|er[\-\+]?(?:positive|negative)?|pr[\-\+]?(?:positive|negative)?|egfr|alk[\-\+]?|braf\s*v600e?|kras|pdl[\-]?1|pd[\-]?l1|msi[\-]?high|brca[12]|nras|met amplification|ros1|ntrk)\b/gi,
    /\b(biomarker|mutation|expression)[:\s]+([a-z0-9\-\+\s,]+)/gi,
  ];
  const biomarkers = findAllMatches(rawText, biomarkerPatterns).map((b) =>
    b.replace(/\s+/g, " ").trim()
  );

  const treatmentPatterns = [
    /(?:prior treatment|previously treated with|received|history of)\s+([a-z][\w\s\-\/,]+?)(?:\.|;|\n)/gi,
    /\b(chemotherapy|radiation|radiotherapy|immunotherapy|targeted therapy|surgery|mastectomy|carboplatin|paclitaxel|pembrolizumab|nivolumab|trastuzumab|osimertinib|bevacizumab|doxorubicin|cisplatin|tamoxifen|anastrozole)\b/gi,
  ];
  const priorTreatments = findAllMatches(rawText, treatmentPatterns);

  const countryPatterns = [
    /(?:lives in|located in|residing in|from|based in|patient in)\s+([A-Za-z][A-Za-z\s,]+?)(?:\.|,|;|\n|$)/i,
    /\b(United States|USA|U\.S\.A\.|UK|United Kingdom|Canada|Germany|France|Spain|Italy|Australia|India)\b/i,
  ];
  const statePatterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/,
    /\b(?:state of|located in)\s+([A-Za-z\s]+?)(?:\.|,|;|\n)/i,
  ];
  const cityPatterns = [
    /\b(?:lives in|located in|from|based in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*/i,
  ];

  let country = findFirstMatch(rawText, countryPatterns);
  let state: string | null = null;
  let city: string | null = findFirstMatch(rawText, cityPatterns);

  const stateMatch = rawText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z]{2})\b/);
  if (stateMatch) {
    city = city ?? stateMatch[1].trim();
    state = stateMatch[2].trim();
    if (!country) country = "United States";
  } else {
    state = findFirstMatch(rawText, statePatterns);
  }

  if (country) {
    country = country
      .replace(/\b(usa|u\.s\.a\.)\b/i, "United States")
      .replace(/\b(uk)\b/i, "United Kingdom")
      .trim();
  }

  const hasLocation = Boolean(city || state || country);

  return {
    age,
    sex,
    primaryDiagnosis,
    stage,
    biomarkers: biomarkers.length > 0 ? biomarkers : [],
    priorTreatments: priorTreatments.length > 0 ? priorTreatments : [],
    location: hasLocation ? { city, state, country } : null,
  };
}
