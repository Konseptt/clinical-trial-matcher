import type { PatientLocation, PatientProfile, TreatmentHistory } from "./types";
import { parseLocationFromNotes } from "./location";
import { normalizeCondition } from "./normalization";

function findFirstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function detectReceptorStatus(
  lower: string,
  token: string
): "positive" | "negative" | null {
  const b = `(?<![a-z])${token}`;
  if (new RegExp(`${b}[\\s\\-]*(?:positive|pos)\\b`, "i").test(lower)) return "positive";
  if (new RegExp(`${b}\\+`, "i").test(lower)) return "positive";
  if (new RegExp(`${b}[\\s\\-]*(?:negative|neg)\\b`, "i").test(lower)) return "negative";
  if (new RegExp(`${b}-(?![a-z])`, "i").test(lower)) return "negative";
  return null;
}

function normalizeBiomarkers(rawText: string): string[] {
  const markers: string[] = [];
  const lower = rawText.toLowerCase();

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
  }

  const erStatus = detectReceptorStatus(lower, "er");
  if (erStatus) markers.push(`ER ${erStatus}`);

  const prStatus = detectReceptorStatus(lower, "pr");
  if (prStatus) markers.push(`PR ${prStatus}`);

  if (/\btriple[\s-]negative\b/i.test(lower) || /\btnbc\b/i.test(lower)) {
    for (const implied of ["ER negative", "PR negative", "HER2 negative"]) {
      const base = implied.split(" ")[0].toLowerCase();
      const already = markers.some(
        (m) => m.toLowerCase() === base || m.toLowerCase().startsWith(`${base} `)
      );
      if (!already) markers.push(implied);
    }
  }

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

const KNOWN_DRUG_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: "Dimethyl fumarate", pattern: /\b(?:dimethyl\s+fumarate|tecfidera)\b/i },
  { name: "Interferon beta-1a", pattern: /\b(?:interferon\s+beta[\s-]1a|interferon\s+beta|avonex|rebif)\b/i },
  { name: "Interferon beta-1b", pattern: /\b(?:interferon\s+beta[\s-]1b|betaseron|extavia)\b/i },
  { name: "Glatiramer acetate", pattern: /\b(?:glatiramer\s+acetate|copaxone)\b/i },
  { name: "Fingolimod", pattern: /\b(?:fingolimod|gilenya)\b/i },
  { name: "Natalizumab", pattern: /\b(?:natalizumab|tysabri)\b/i },
  { name: "Ocrelizumab", pattern: /\b(?:ocrelizumab|ocrevus)\b/i },
  { name: "Ofatumumab", pattern: /\b(?:ofatumumab|kesimpta)\b/i },
  { name: "Ublituximab", pattern: /\b(?:ublituximab|briumvi)\b/i },
  { name: "Siponimod", pattern: /\b(?:siponimod|mayzent)\b/i },
  { name: "Ozanimod", pattern: /\b(?:ozanimod|zeposia)\b/i },
  { name: "Ponesimod", pattern: /\b(?:ponesimod|ponvory)\b/i },
  { name: "Cladribine", pattern: /\b(?:cladribine|mavenclad)\b/i },
  { name: "Alemtuzumab", pattern: /\b(?:alemtuzumab|lemtrada)\b/i },
  { name: "Teriflunomide", pattern: /\b(?:teriflunomide|aubagio)\b/i },
  { name: "Trastuzumab", pattern: /\b(?:trastuzumab|herceptin)\b/i },
  { name: "Pertuzumab", pattern: /\b(?:pertuzumab|perjeta)\b/i },
  { name: "Pembrolizumab", pattern: /\b(?:pembrolizumab|keytruda)\b/i },
  { name: "Nivolumab", pattern: /\b(?:nivolumab|opdivo)\b/i },
  { name: "Carboplatin", pattern: /\bcarboplatin\b/i },
  { name: "Paclitaxel", pattern: /\bpaclitaxel\b/i },
  { name: "Tamoxifen", pattern: /\btamoxifen\b/i },
  { name: "Anastrozole", pattern: /\banastrozole\b/i },
  { name: "Chemotherapy", pattern: /\b(?:chemotherapy|chemo)\b/i },
  { name: "Surgery", pattern: /\b(?:surgery|mastectomy|lumpectomy|resection)\b/i },
  { name: "Radiation", pattern: /\b(?:radiation|radiotherapy)\b/i },
  { name: "Immunotherapy", pattern: /\bimmunotherapy\b/i },
  { name: "Targeted therapy", pattern: /\btargeted\s+therapy\b/i },
];

function extractTreatmentsAndTimeline(rawText: string): {
  priorTreatments: string[];
  currentTreatment: string | null;
  previousTreatments: Array<{ name: string; reasonDiscontinued?: string }>;
  timeline: TreatmentHistory[];
} {
  const sentences = rawText.split(/(?<=[.;\n])\s+/);
  const foundNames = new Set<string>();
  const timeline: TreatmentHistory[] = [];
  let currentTreatment: string | null = null;
  const previousTreatments: Array<{ name: string; reasonDiscontinued?: string }> = [];

  for (const item of KNOWN_DRUG_PATTERNS) {
    if (item.pattern.test(rawText)) {
      foundNames.add(item.name);

      const sentence =
        sentences.find((s) => item.pattern.test(s))?.toLowerCase() ?? "";

      const isDiscontinued =
        /\b(?:discontinued|stopped|switched\s+from|prior\s+to|initially\s+received|previously\s+took|intolerant|failed|former)\b/i.test(sentence) &&
        !/\b(?:switched\s+to|current|currently|now\s+on)\b/i.test(sentence);

      const isCurrent =
        /\b(?:switched\s+to|currently|current|now\s+taking|have\s+taken\s+for|taking\s+for|presently|ongoing|maintenance)\b/i.test(sentence) ||
        (!isDiscontinued && /\b(?:taking|take|prescribed|on)\b/i.test(sentence));

      let reasonDiscontinued: string | undefined;
      const reasonMatch = sentence.match(
        /(?:after|due to|because of|with)\s+([a-z\s\-]+?(?:effects?|adverse|toxicity|intolerance|progression|relapse|reaction))/i
      );
      if (reasonMatch?.[1]) {
        reasonDiscontinued = reasonMatch[1].trim();
      }

      if (isCurrent && !currentTreatment) {
        currentTreatment = item.name;
      }

      if (isDiscontinued || reasonDiscontinued) {
        previousTreatments.push({
          name: item.name,
          reasonDiscontinued: reasonDiscontinued ?? "adverse effects / intolerance",
        });
      }

      timeline.push({
        name: item.name,
        ongoing: isCurrent && !isDiscontinued,
        reasonDiscontinued,
      });
    }
  }

  // Fallback: If current treatment wasn't set, pick the last non-discontinued therapy
  if (!currentTreatment && timeline.length > 0) {
    const ongoingOne = timeline.find((t) => t.ongoing);
    if (ongoingOne) {
      currentTreatment = ongoingOne.name;
    }
  }

  return {
    priorTreatments: Array.from(foundNames),
    currentTreatment,
    previousTreatments,
    timeline,
  };
}

const NUMBER_WORDS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
};

function extractDiseaseDuration(text: string): string | null {
  const match = text.match(
    /\b(?:diagnosed|onset|history|symptoms?)\s*(?:approximately|about|around)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(years?|months?|weeks?)\s*ago\b/i
  ) || text.match(
    /\b(?:approximately|about|around|~)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(years?|months?|weeks?)(?:\s+ago|\s+duration)?\b/i
  );

  if (match) {
    const rawNum = match[1].toLowerCase();
    const num = NUMBER_WORDS[rawNum] ?? rawNum;
    return `approximately ${num} ${match[2]}`.trim();
  }
  return null;
}

function extractSymptoms(text: string): string[] {
  const symptoms: string[] = [];
  const patterns: Array<{ symptom: string; re: RegExp }> = [
    { symptom: "right-leg numbness and weakness", re: /numbness\s+and\s+weakness\s+in\s+(?:my|the)?\s*right\s+leg/i },
    { symptom: "optic neuritis", re: /optic\s+neuritis/i },
    { symptom: "fatigue", re: /\bfatigue\b/i },
    { symptom: "lower-extremity weakness", re: /lower[\s-]extremity\s+weakness/i },
    { symptom: "numbness", re: /\bnumbness\b/i },
    { symptom: "spasticity", re: /\bspasticity\b/i },
    { symptom: "ataxia", re: /\bataxia\b/i },
    { symptom: "neuropathy", re: /\bneuropathy\b/i },
  ];

  for (const p of patterns) {
    if (p.re.test(text)) {
      symptoms.push(p.symptom);
    }
  }
  return symptoms;
}

function extractRecentDiseaseActivity(text: string): string | null {
  const relapseMatch = text.match(
    /\b((?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:confirmed\s+)?relapses?\s+(?:in|during|over)\s+(?:the\s+)?(?:past|last)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+months?)\b/i
  );
  if (relapseMatch) {
    const raw = relapseMatch[1].trim();
    // Normalize word numbers to digits
    return raw
      .replace(/\btwo\b/i, "2")
      .replace(/\bone\b/i, "1")
      .replace(/\bthree\b/i, "3")
      .replace(/\bfour\b/i, "4")
      .replace(/\beighteen\b/i, "18");
  }

  const activityMatch = text.match(
    /\b(active\s+disease|disease\s+progression|frequent\s+relapses|relapses?\s+in\s+the\s+past\s+year)\b/i
  );
  if (activityMatch) return activityMatch[1].trim();

  return null;
}

function extractMriFindings(text: string): string | null {
  const matches = [
    ...text.matchAll(/(?:mri\s+(?:showed|demonstrated|revealed|findings?[:\s])\s*)([^.;\n]+(?:new\s+t2\s+lesions|demyelinating\s+lesions|enhancing\s+lesions|lesions)[^.;\n]*)/gi),
  ];

  if (matches.length > 0) {
    const items = matches.map((m) => m[1].trim());
    return [...new Set(items)].join("; ");
  }

  const directMatch = text.match(/\b(several\s+new\s+T2\s+lesions[^.;\n]*|multiple\s+demyelinating\s+lesions[^.;\n]*)/i);
  if (directMatch) {
    return directMatch[1].trim();
  }

  return null;
}

function extractPriorAdvancedTherapies(text: string): {
  infusionDmt: boolean | null;
  stemCell: boolean | null;
  investigational: boolean | null;
} {
  const lower = text.toLowerCase();
  const neverReceivedMatch = lower.match(/never\s+(?:received|had|taken)\s+([^.;\n]+)/i);
  const neverText = neverReceivedMatch?.[1] ?? "";

  const noInfusion = /infusion/i.test(neverText) || /no\s+infusion/i.test(lower);
  const noStemCell = /stem[\s-]cell/i.test(neverText) || /no\s+stem[\s-]cell/i.test(lower);
  const noInvestigational = /investigational/i.test(neverText) || /no\s+investigational/i.test(lower);

  return {
    infusionDmt: noInfusion ? false : null,
    stemCell: noStemCell ? false : null,
    investigational: noInvestigational ? false : null,
  };
}

function extractInterests(text: string): string[] {
  const interests: string[] = [];
  if (/disease[\s-]modifying\s+treatments?|dmt/i.test(text)) {
    interests.push("disease-modifying treatments");
  }
  if (/her2[\s-]?targeted|anti[\s-]?her2|trastuzumab|pertuzumab/i.test(text)) {
    interests.push("HER2-targeted therapy");
  }
  if (/immunotherapy|checkpoint/i.test(text)) {
    interests.push("immunotherapy");
  }
  if (/clinical\s+trials?\s+evaluating\s+([^.;,\n]+)/i.test(text)) {
    const m = text.match(/clinical\s+trials?\s+evaluating\s+([^.;,\n]+)/i);
    if (m?.[1]) interests.push(m[1].trim());
  }
  return [...new Set(interests)];
}

export function extractPatientProfile(rawText: string): PatientProfile {
  const normalizedText = rawText.replace(/\s+/g, " ");
  const text = normalizedText.toLowerCase();

  const normCondition = normalizeCondition(normalizedText);

  const ageMatch =
    text.match(/\b(\d{1,3})[\s-]*(?:year|yr|y\.?o|years old)\b/) ||
    text.match(/\b(?:i(?:'m| am)|age[d:]?)\s*(\d{1,3})\b/);
  const age = ageMatch ? Math.min(parseInt(ageMatch[1], 10), 120) : null;

  let sex: PatientProfile["sex"] = "unknown";
  if (/\b(male|man|m\/f.*\bm\b|he\/him|his\b)/.test(text)) sex = "male";
  else if (/\b(female|woman|f\/m|she\/her|hers\b)/.test(text)) sex = "female";

  const stagePatterns = [
    /\bstage\s+(i{1,3}[abc]?|iv[abc]?|0|[1-4][abc]?)\b/i,
    /\b(staging|classified as)\s+(i{1,3}[abc]?|iv[abc]?)\b/i,
  ];
  const stage = findFirstMatch(normalizedText, stagePatterns);

  const biomarkers = normalizeBiomarkers(normalizedText);
  const treatmentInfo = extractTreatmentsAndTimeline(normalizedText);
  const location = parseLocationFromNotes(normalizedText);
  const diseaseDuration = extractDiseaseDuration(normalizedText);
  const symptoms = extractSymptoms(normalizedText);
  const recentDiseaseActivity = extractRecentDiseaseActivity(normalizedText);
  const mriFindings = extractMriFindings(normalizedText);
  const priorAdvancedTherapies = extractPriorAdvancedTherapies(normalizedText);
  const interests = extractInterests(normalizedText);

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

  return {
    age,
    sex,
    primaryDiagnosis: normCondition.canonicalName,
    subtype: normCondition.subtype,
    diseaseDuration,
    symptoms,
    currentTreatment: treatmentInfo.currentTreatment,
    previousTreatments: treatmentInfo.previousTreatments,
    recentDiseaseActivity,
    mriFindings,
    priorAdvancedTherapies,
    stage,
    biomarkers,
    priorTreatments: treatmentInfo.priorTreatments,
    priorTreatmentsTimeline: treatmentInfo.timeline,
    location,
    hasMetastaticDisease: extractMetastaticStatus(),
    interests,
  };
}
