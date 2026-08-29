export interface NormalizedCondition {
  canonicalName: string;
  subtype: string | null;
  synonyms: string[];
  queryCondition: string;
}

interface KnownConditionRule {
  pattern: RegExp;
  canonicalName: string;
  defaultSubtype?: string;
  synonyms: string[];
  subtypes?: Array<{
    pattern: RegExp;
    name: string;
    synonyms?: string[];
  }>;
}

const KNOWN_CONDITIONS: KnownConditionRule[] = [
  {
    pattern: /\b(?:multiple\s+sclerosis|rrms|spms|ppms|relapsing[\s-]remitting\s+ms|secondary\s+progressive\s+ms|primary\s+progressive\s+ms|\bms\b)\b/i,
    canonicalName: "Multiple Sclerosis",
    synonyms: ["Multiple Sclerosis", "MS", "Demyelinating Disease"],
    subtypes: [
      {
        pattern: /\b(?:relapsing[\s-]remitting|rrms|relapsing\s+remitting\s+multiple\s+sclerosis)\b/i,
        name: "Relapsing-Remitting Multiple Sclerosis (RRMS)",
        synonyms: ["Relapsing-Remitting Multiple Sclerosis", "RRMS", "Relapsing Remitting MS"],
      },
      {
        pattern: /\b(?:secondary\s+progressive|spms)\b/i,
        name: "Secondary Progressive Multiple Sclerosis (SPMS)",
        synonyms: ["Secondary Progressive Multiple Sclerosis", "SPMS"],
      },
      {
        pattern: /\b(?:primary\s+progressive|ppms)\b/i,
        name: "Primary Progressive Multiple Sclerosis (PPMS)",
        synonyms: ["Primary Progressive Multiple Sclerosis", "PPMS"],
      },
      {
        pattern: /\b(?:clinically\s+isolated\s+syndrome|cis)\b/i,
        name: "Clinically Isolated Syndrome (CIS)",
        synonyms: ["Clinically Isolated Syndrome", "CIS"],
      },
    ],
  },
  {
    pattern: /\b(?:breast\s+cancer|breast\s+carcinoma|breast\s+neoplasm|mammary\s+carcinoma)\b/i,
    canonicalName: "Breast Cancer",
    synonyms: ["Breast Cancer", "Breast Carcinoma", "Breast Neoplasms"],
    subtypes: [
      {
        pattern: /\btriple[\s-]negative\b/i,
        name: "Triple-Negative Breast Cancer (TNBC)",
        synonyms: ["Triple-Negative Breast Cancer", "TNBC"],
      },
      {
        pattern: /\bher2[\s-]*(?:positive|\+)\b/i,
        name: "HER2-Positive Breast Cancer",
        synonyms: ["HER2-Positive Breast Cancer", "HER2+ Breast Cancer"],
      },
      {
        pattern: /\b(?:hr[\s-]*positive|er[\s-]*positive|hormone\s+receptor[\s-]*positive)\b/i,
        name: "Hormone Receptor-Positive Breast Cancer",
        synonyms: ["HR+ Breast Cancer", "ER+ Breast Cancer"],
      },
    ],
  },
  {
    pattern: /\b(?:non[\s-]small\s+cell\s+lung|nsclc)\b/i,
    canonicalName: "Non-Small Cell Lung Cancer",
    synonyms: ["Non-Small Cell Lung Cancer", "NSCLC", "Lung Carcinoma"],
  },
  {
    pattern: /\b(?:small\s+cell\s+lung|sclc)\b/i,
    canonicalName: "Small Cell Lung Cancer",
    synonyms: ["Small Cell Lung Cancer", "SCLC"],
  },
  {
    pattern: /\b(?:lung\s+cancer|lung\s+carcinoma|lung\s+neoplasm)\b/i,
    canonicalName: "Lung Cancer",
    synonyms: ["Lung Cancer", "Lung Neoplasms", "Pulmonary Carcinoma"],
  },
  {
    pattern: /\b(?:colorectal\s+cancer|colon\s+cancer|rectal\s+cancer|crc)\b/i,
    canonicalName: "Colorectal Cancer",
    synonyms: ["Colorectal Cancer", "Colon Cancer", "Rectal Cancer"],
  },
  {
    pattern: /\b(?:melanoma|cutaneous\s+melanoma)\b/i,
    canonicalName: "Melanoma",
    synonyms: ["Melanoma", "Malignant Melanoma", "Cutaneous Melanoma"],
  },
  {
    pattern: /\b(?:prostate\s+cancer|prostatic\s+neoplasm)\b/i,
    canonicalName: "Prostate Cancer",
    synonyms: ["Prostate Cancer", "Prostatic Neoplasms"],
  },
  {
    pattern: /\b(?:ovarian\s+cancer|ovary\s+cancer)\b/i,
    canonicalName: "Ovarian Cancer",
    synonyms: ["Ovarian Cancer", "Ovarian Neoplasms"],
  },
  {
    pattern: /\b(?:pancreatic\s+cancer|pancreas\s+cancer|pancreatic\s+ductal\s+adenocarcinoma|pdac)\b/i,
    canonicalName: "Pancreatic Cancer",
    synonyms: ["Pancreatic Cancer", "Pancreatic Ductal Adenocarcinoma"],
  },
  {
    pattern: /\b(?:crohn'?s(?:\s+disease)?|regional\s+enteritis)\b/i,
    canonicalName: "Crohn's Disease",
    synonyms: ["Crohn's Disease", "Inflammatory Bowel Disease", "IBD"],
  },
  {
    pattern: /\b(?:ulcerative\s+colitis|uc)\b/i,
    canonicalName: "Ulcerative Colitis",
    synonyms: ["Ulcerative Colitis", "Inflammatory Bowel Disease", "IBD"],
  },
  {
    pattern: /\b(?:rheumatoid\s+arthritis|ra)\b/i,
    canonicalName: "Rheumatoid Arthritis",
    synonyms: ["Rheumatoid Arthritis", "RA"],
  },
  {
    pattern: /\b(?:systemic\s+lupus|sle|lupus\s+erythematosus)\b/i,
    canonicalName: "Systemic Lupus Erythematosus",
    synonyms: ["Systemic Lupus Erythematosus", "Lupus", "SLE"],
  },
  {
    pattern: /\b(?:parkinson'?s(?:\s+disease)?|parkinsonism)\b/i,
    canonicalName: "Parkinson's Disease",
    synonyms: ["Parkinson's Disease", "Parkinson Disease", "PD"],
  },
  {
    pattern: /\b(?:alzheimer'?s(?:\s+disease)?|ad)\b/i,
    canonicalName: "Alzheimer's Disease",
    synonyms: ["Alzheimer's Disease", "Alzheimer Disease", "Dementia"],
  },
  {
    pattern: /\b(?:amyotrophic\s+lateral\s+sclerosis|als|lou\s+gehrig'?s)\b/i,
    canonicalName: "Amyotrophic Lateral Sclerosis",
    synonyms: ["Amyotrophic Lateral Sclerosis", "ALS", "Motor Neuron Disease"],
  },
  {
    pattern: /\b(?:type\s+2\s+diabetes|t2d|type\s+ii\s+diabetes)\b/i,
    canonicalName: "Type 2 Diabetes Mellitus",
    synonyms: ["Type 2 Diabetes", "T2D", "Diabetes Mellitus Type 2"],
  },
  {
    pattern: /\b(?:type\s+1\s+diabetes|t1d|type\s+i\s+diabetes)\b/i,
    canonicalName: "Type 1 Diabetes Mellitus",
    synonyms: ["Type 1 Diabetes", "T1D", "Diabetes Mellitus Type 1"],
  },
  {
    pattern: /\b(?:heart\s+failure|hf|congestive\s+heart\s+failure|chf)\b/i,
    canonicalName: "Heart Failure",
    synonyms: ["Heart Failure", "Congestive Heart Failure", "CHF"],
  },
  {
    pattern: /\b(?:renal\s+cell\s+carcinoma|kidney\s+cancer|rcc)\b/i,
    canonicalName: "Renal Cell Carcinoma",
    synonyms: ["Renal Cell Carcinoma", "Kidney Cancer", "RCC"],
  },
  {
    pattern: /\b(?:glioblastoma|gbm|glioma)\b/i,
    canonicalName: "Glioblastoma",
    synonyms: ["Glioblastoma", "Glioblastoma Multiforme", "Glioma"],
  },
  {
    pattern: /\b(?:multiple\s+myeloma|myeloma)\b/i,
    canonicalName: "Multiple Myeloma",
    synonyms: ["Multiple Myeloma", "Plasma Cell Myeloma"],
  },
];

/**
 * Normalizes any free-text or extracted diagnosis into a clean medical entity
 * with canonical name, identified subtype, and registry-ready synonyms.
 */
export function normalizeCondition(rawInput: string): NormalizedCondition {
  const text = String(rawInput ?? "").trim();
  if (!text) {
    return {
      canonicalName: "unspecified condition",
      subtype: null,
      synonyms: [],
      queryCondition: "condition",
    };
  }

  for (const rule of KNOWN_CONDITIONS) {
    if (rule.pattern.test(text)) {
      let subtype: string | null = rule.defaultSubtype ?? null;
      let matchedSynonyms = [...rule.synonyms];

      if (rule.subtypes) {
        for (const sub of rule.subtypes) {
          if (sub.pattern.test(text)) {
            subtype = sub.name;
            if (sub.synonyms) {
              matchedSynonyms = [...sub.synonyms, ...matchedSynonyms];
            }
            break;
          }
        }
      }

      const queryCondition = subtype
        ? subtype.replace(/\s*\([^)]*\)/g, "").trim()
        : rule.canonicalName;

      return {
        canonicalName: rule.canonicalName,
        subtype,
        synonyms: [...new Set(matchedSynonyms)],
        queryCondition,
      };
    }
  }

  // Fallback cleanup for unrecognized conditions:
  // Strip conversational lead-ins, timing phrases, and punctuation
  let cleaned = text
    .replace(/^(?:i\s+(?:was|have\s+been)\s+diagnosed\s+with|diagnosed\s+with|diagnosis\s+of|history\s+of|presents\s+with|living\s+with|suffering\s+from)\s+/i, "")
    .replace(/\s+(?:approximately|about|\d+)\s+(?:years?|months?|weeks?)\s+ago.*$/i, "")
    .replace(/\s+after\s+developing.*$/i, "")
    .replace(/\s+with\s+a\s+history\s+of.*$/i, "")
    .replace(/\b(?:stage\s+[ivx0-9]+[abc]?)\b/gi, "")
    .replace(/[;,.].*$/, "")
    .trim();

  if (!cleaned) {
    cleaned = "unspecified condition";
  }

  // Capitalize nicely
  const canonicalName = cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return {
    canonicalName,
    subtype: null,
    synonyms: [canonicalName],
    queryCondition: canonicalName,
  };
}
