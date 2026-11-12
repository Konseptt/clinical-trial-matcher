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
    const m = marker.re.exec(lower);
    if (!m) continue;
    const before = lower.slice(Math.max(0, m.index - 20), m.index);
    const after = lower.slice(m.index + m[0].length, m.index + m[0].length + 30);
    // "ALK negative", "KRAS wild-type", "no EGFR mutation", "EGFR not detected"
    const negative =
      /^[\s:-]*(?:negative|neg\b|wild[\s-]?type|wt\b|not\s+detected|unmutated|absent)/.test(after) ||
      /\b(?:no|negative\s+for|without)\s+(?:\w+\s+)?$/.test(before);
    markers.push(negative ? `${marker.id} negative` : marker.id);
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
  { name: "Trastuzumab deruxtecan", pattern: /\b(?:trastuzumab[\s-]+deruxtecan|t-?dxd|enhertu)\b/i },
  { name: "Trastuzumab emtansine", pattern: /\b(?:trastuzumab[\s-]+emtansine|t-?dm1|kadcyla)\b/i },
  { name: "Trastuzumab", pattern: /\b(?:trastuzumab|herceptin)\b(?![\s-]+(?:deruxtecan|emtansine))/i },
  { name: "Tucatinib", pattern: /\b(?:tucatinib|tukysa)\b/i },
  { name: "Lapatinib", pattern: /\b(?:lapatinib|tykerb)\b/i },
  { name: "Neratinib", pattern: /\b(?:neratinib|nerlynx)\b/i },
  { name: "Docetaxel", pattern: /\b(?:docetaxel|taxotere)\b/i },
  { name: "Capecitabine", pattern: /\b(?:capecitabine|xeloda)\b/i },
  { name: "Letrozole", pattern: /\b(?:letrozole|femara)\b/i },
  { name: "Exemestane", pattern: /\b(?:exemestane|aromasin)\b/i },
  { name: "Fulvestrant", pattern: /\b(?:fulvestrant|faslodex)\b/i },
  { name: "Palbociclib", pattern: /\b(?:palbociclib|ibrance)\b/i },
  { name: "Ribociclib", pattern: /\b(?:ribociclib|kisqali)\b/i },
  { name: "Abemaciclib", pattern: /\b(?:abemaciclib|verzenio)\b/i },
  { name: "Olaparib", pattern: /\b(?:olaparib|lynparza)\b/i },
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

const NEGATION_CUE = /\b(?:no(?!\s+(?:evidence|sign)\s+of)|not|never|denies|denied|without|naive\s+to|free\s+of)\b(?![^.;]*\b(?:but|however|then|except)\b)[^.;]*$/i;

function isNegatedMention(sentence: string, pattern: RegExp): boolean {
  const m = sentence.match(pattern);
  if (!m || m.index === undefined) return false;
  // Cue within ~6 words before the drug ("no prior chemotherapy", "denies prior trastuzumab").
  const before = sentence.slice(Math.max(0, m.index - 45), m.index);
  return NEGATION_CUE.test(before);
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/**
 * End date when the sentence says the therapy finished ("completed 2026-09-20",
 * "last infusion August 2026", "ended in March 2026"). Returns YYYY-MM-DD or YYYY-MM.
 */
function findEndDate(sentence: string): string | undefined {
  const cue = /\b(?:completed|complete|ended|finished|stopped|discontinued|last\s+(?:dose|infusion|cycle|treatment)|progressed|until|through)\b/i;
  const m = sentence.match(cue);
  if (!m || m.index === undefined) return undefined;
  const after = sentence.slice(m.index, m.index + 120);
  const iso = after.match(/\b(20\d{2})-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?\b/);
  if (iso) return iso[3] ? `${iso[1]}-${iso[2]}-${iso[3]}` : `${iso[1]}-${iso[2]}`;
  const us = after.match(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const named = after.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:(\d{1,2}),?\s+)?(20\d{2})\b/i);
  if (named) {
    const mm = MONTHS[named[1].toLowerCase()];
    return named[2] ? `${named[3]}-${mm}-${named[2].padStart(2, "0")}` : `${named[3]}-${mm}`;
  }
  // "stopped working in late October": no year, so take the most recent past
  // occurrence of that month. Notes describe history, never future end dates.
  const bare = after.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b(?!\s+\d)/i);
  if (bare) {
    const month = Number(MONTHS[bare[1].toLowerCase()]);
    const now = new Date();
    const year = month <= now.getUTCMonth() + 1 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  return undefined;
}

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
    // "No prior chemotherapy" / "denies trastuzumab" must not count as history.
    const mentions = sentences.filter((s) => item.pattern.test(s) && !isNegatedMention(s, item.pattern));
    if (mentions.length > 0) {
      foundNames.add(item.name);

      const sentence = mentions[0].toLowerCase();

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

      // "Finished X in September 2026, then Y stopped in October": read the
      // date from the clause naming this drug, not the first date in the sentence.
      const clause =
        sentence.split(/;|,?\s+(?:then|later|subsequently|followed by)\s+/).find((c) => item.pattern.test(c)) ?? sentence;
      const endDate = findEndDate(clause);
      timeline.push({
        name: item.name,
        ongoing: endDate ? false : isCurrent && !isDiscontinued,
        ...(endDate ? { endDate } : {}),
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
    /\b(?:approximately|about|around|~)?\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(years?|months?|weeks?)(?:\s+ago|\s+duration|\s+history)\b/i
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
  const normalizedText = rawText
    .replace(/\s+/g, " ")
    // "not HER2 positive" / "not ER-negative" invert the stated receptor status.
    .replace(/\bnot\s+((?:her[\s-]?2|er|pr|hr))[\s-]*(?:positive|pos)\b/gi, "$1 negative")
    .replace(/\bnot\s+((?:her[\s-]?2|er|pr|hr))[\s-]*(?:negative|neg)\b/gi, "$1 positive");
  const text = normalizedText.toLowerCase();

  const normCondition = normalizeCondition(normalizedText);

  // Patient age only: "45-year-old", "45 yo", "aged 45", "45M". A bare
  // "3 years ago" / "10-year history" is disease duration, not age.
  const ageMatch =
    text.match(/\b(\d{1,3})[\s-]*(?:years?|yrs?)[\s-]*old\b/) ||
    text.match(/\b(\d{1,3})\s*(?:y\.?o\.?|y\/o)(?![a-z])/) ||
    text.match(/\b(?:i(?:'m| am)|age[d:]?|aged)\s*(\d{1,3})\b/) ||
    text.match(/\b(\d{1,3})\s*(?:m|f)\b(?!\/)/);
  const age = ageMatch ? Math.min(parseInt(ageMatch[1], 10), 120) : null;

  let sex: PatientProfile["sex"] = "unknown";
  // Earliest explicit cue wins; every alternative is word-bounded so
  // "managed"/"many" no longer read as male.
  const maleAt = text.search(/\b(?:male|man|men|gentleman|he|him|his|\d{1,3}\s*m)\b/);
  const femaleAt = text.search(/\b(?:female|woman|women|lady|she|her|hers|\d{1,3}\s*f)\b/);
  if (maleAt >= 0 && (femaleAt < 0 || maleAt < femaleAt)) sex = "male";
  else if (femaleAt >= 0) sex = "female";

  const stagePatterns = [
    /\bstage\s+(i{1,3}[abc]?|iv[abc]?|0|[1-4][abc]?)\b/i,
    /\b(?:staging|classified as)\s+(i{1,3}[abc]?|iv[abc]?)\b/i,
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
