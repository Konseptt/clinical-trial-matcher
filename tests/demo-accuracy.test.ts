import { describe, it, expect } from "vitest";
import { extractPatientProfile } from "@/lib/extract";
import {
  BIOMARKER_CONFLICT_SCORE_CAP,
  extractWashoutPeriod,
  rankMatchedTrials,
  scoreAllRegistryTrials,
} from "@/lib/scoring";
import { forecastTrialEligibility } from "@/lib/eligibility-forecast";
import type { RegistryTrial } from "@/lib/registries/types";

const trial = (over: Partial<RegistryTrial>): RegistryTrial => ({
  registry: "ClinicalTrials.gov",
  trialId: "NCT0",
  title: "HER2-positive breast cancer study",
  phase: "Phase 2",
  summary: "",
  status: "RECRUITING",
  locations: [],
  eligibilityText: "",
  url: "https://x",
  ...over,
});

describe("washout phrasing (fix 3)", () => {
  it.each([
    ["Exclusion Criteria: trastuzumab within 28 days prior to enrollment.", "trastuzumab", 28],
    ["Exclusion Criteria: treatment with trastuzumab within 4 weeks before first dose.", "trastuzumab", 28],
    ["Exclusion Criteria: no chemotherapy, radiotherapy or trastuzumab within 3 weeks.", "radiation", 21],
    ["≥ 4 weeks from last trastuzumab", "trastuzumab", 28],
    ["At least 28 days since last dose of trastuzumab.", "trastuzumab", 28],
  ])("%s", (text, drug, days) => {
    expect(extractWashoutPeriod(text, drug)).toBe(days);
  });

  it("ignores 'within' in inclusion criteria (progressed within 6 months)", () => {
    const text =
      "Inclusion Criteria: progressed on trastuzumab within 6 months. Exclusion Criteria: pregnancy.";
    expect(extractWashoutPeriod(text, "trastuzumab")).toBeNull();
  });
});

describe("note reading (fixes 4, 5)", () => {
  it("reads end dates so the forecast can project a date", () => {
    const p = extractPatientProfile(
      "52F HER2-positive breast cancer stage IV. Trastuzumab and pertuzumab with docetaxel, completed 2026-09-20; then trastuzumab deruxtecan, progressed 2026-10-30. Radiation ended in March 2026."
    );
    const byName = Object.fromEntries((p.priorTreatmentsTimeline ?? []).map((t) => [t.name, t]));
    expect(byName.Trastuzumab?.endDate).toBe("2026-09-20");
    expect(byName.Docetaxel?.endDate).toBe("2026-09-20");
    expect(byName["Trastuzumab deruxtecan"]?.endDate).toBe("2026-10-30");
    expect(byName.Radiation?.endDate).toBe("2026-03");
    expect(byName.Trastuzumab?.ongoing).toBe(false);
  });

  it("does not record negated therapies", () => {
    const p = extractPatientProfile(
      "60F, HER2 negative, ER positive. No prior chemotherapy. Denies prior trastuzumab. Previously on letrozole and palbociclib."
    );
    expect(p.priorTreatments).not.toContain("Chemotherapy");
    expect(p.priorTreatments).not.toContain("Trastuzumab");
    expect(p.priorTreatments).toEqual(expect.arrayContaining(["Letrozole", "Palbociclib"]));
  });

  it("'not HER2 positive' is HER2 negative", () => {
    expect(extractPatientProfile("Breast cancer, not HER2 positive. 49 y/o female.").biomarkers).toContain(
      "HER2 negative"
    );
  });

  it("age is not reported as disease duration", () => {
    expect(extractPatientProfile("68-year-old man with breast cancer.").diseaseDuration).toBeNull();
  });
});

describe("ranking + stage (fixes 1, 2)", () => {
  const metastatic = extractPatientProfile(
    "52-year-old female with metastatic HER2-positive breast cancer, stage IV with liver metastases."
  );

  it("metastatic patient is blocked from early-stage-only trials", async () => {
    const [s] = await scoreAllRegistryTrials(
      [
        trial({
          title: "Neoadjuvant therapy in HER2-positive early-stage breast cancer",
          eligibilityText:
            "Inclusion Criteria: stage II-III operable breast cancer. Exclusion Criteria: stage IV disease.",
        }),
      ],
      metastatic
    );
    expect(s.scoreBreakdown.stagePenalties).toBeGreaterThan(0);
    expect(forecastTrialEligibility(s, metastatic).status).toBe("likely-ineligible");
    expect(s.matchScore).toBeLessThanOrEqual(BIOMARKER_CONFLICT_SCORE_CAP);
  });

  it("metastatic patient is not penalised for 'locally advanced or metastatic' trials", async () => {
    const [s] = await scoreAllRegistryTrials(
      [
        trial({
          eligibilityText:
            "Inclusion Criteria: locally advanced or metastatic HER2-positive breast cancer. Exclusion Criteria: untreated brain metastases.",
        }),
      ],
      metastatic
    );
    expect(s.scoreBreakdown.stagePenalties).toBe(0);
  });

  it("orders by uncapped score when displayed scores tie at 100", async () => {
    const scored = await scoreAllRegistryTrials(
      [
        trial({ trialId: "WEAK", title: "Breast cancer registry" }),
        trial({
          trialId: "STRONG",
          title: "Trastuzumab deruxtecan in metastatic HER2-positive breast cancer stage IV",
          eligibilityText: "Inclusion Criteria: HER2-positive metastatic breast cancer.",
        }),
      ],
      metastatic
    );
    const ranked = rankMatchedTrials(scored);
    expect(ranked[0].trialId).toBe("STRONG");
    expect(ranked[0].rankScore!).toBeGreaterThan(ranked[1].rankScore!);
  });
});

describe("end dates per clause and AI merge", () => {
  it("assigns each drug the date from its own clause, bare month = most recent past", () => {
    const p = extractPatientProfile(
      "I finished Herceptin and Perjeta with Taxotere in September 2026, then Enhertu stopped working in late October."
    );
    const by = Object.fromEntries((p.priorTreatmentsTimeline ?? []).map((t) => [t.name, t.endDate]));
    expect(by.Trastuzumab).toBe("2026-09");
    expect(by.Docetaxel).toBe("2026-09");
    const now = new Date();
    const expectYear = 10 <= now.getUTCMonth() + 1 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    expect(by["Trastuzumab deruxtecan"]).toBe(`${expectYear}-10`);
  });
});

describe("AI profile coercion", () => {
  it("strips 'Stage' prefix and brand parentheses, keeps rule names and timeline", async () => {
    const { coercePatientProfile } = await import("@/lib/extract-ai");
    const fallback = extractPatientProfile("52F HER2-positive breast cancer. Trastuzumab completed 2026-09-20.");
    const p = coercePatientProfile(
      { stage: "Stage IV", priorTreatments: ["Trastuzumab (Herceptin)", "Tucatinib (Tukysa)", "Margetuximab"] },
      fallback
    );
    expect(p.stage).toBe("IV");
    expect(p.priorTreatments).toEqual(["Trastuzumab", "Tucatinib", "Margetuximab"]);
    expect(p.priorTreatmentsTimeline?.[0]?.endDate).toBe("2026-09-20");
  });
});

describe("recruitment status state machine", () => {
  it.each([
    ["RECRUITING", true],
    ["NOT_YET_RECRUITING", true],
    ["ENROLLING_BY_INVITATION", true],
    ["Ongoing, recruiting", true],
    ["Authorised, recruitment pending", true],
    ["Recruitment status: Recruiting", true],
    ["ACTIVE_NOT_RECRUITING", false],
    ["Active, not recruiting", false],
    ["Recruitment complete", false],
    ["Recruitment completed", false],
    ["Recruitment ended", false],
    ["Recruitment suspended", false],
    ["Ongoing, recruitment ended", false],
    ["Recruiting stopped after recruiting started", false],
    ["Not Authorised", false],
    ["Temporarily halted", false],
    ["COMPLETED", false],
    ["Pending", false],
  ])("%s -> open=%s", async (status, open) => {
    const { isOpenRecruitmentStatus } = await import("@/lib/registries/filters");
    expect(isOpenRecruitmentStatus(status)).toBe(open);
  });

  it("CTIS code 3 (ongoing, recruitment pending) is not reported as recruiting", async () => {
    const { CTIS_OPEN_STATUS } = await import("@/lib/registries/eu-ctr");
    expect(CTIS_OPEN_STATUS[3]).toBe("Not yet recruiting");
    expect(CTIS_OPEN_STATUS[4]).toBe("Recruiting");
  });

  it("'recruitment pending' trials forecast as opens-later", async () => {
    const [s] = await scoreAllRegistryTrials(
      [trial({ status: "Authorised, recruitment pending" })],
      extractPatientProfile("52F HER2-positive breast cancer.")
    );
    expect(forecastTrialEligibility(s, extractPatientProfile("52F HER2-positive breast cancer.")).status).toBe(
      "opens-later"
    );
  });
});

describe("forecast without published criteria", () => {
  it("is action-needed, not ready", async () => {
    const p = extractPatientProfile("52F HER2-positive breast cancer.");
    const [s] = await scoreAllRegistryTrials([trial({ registry: "EU-CTR", eligibilityText: "" })], p);
    const f = forecastTrialEligibility(s, p);
    expect(f.status).toBe("action-needed");
    expect(f.actions.join(" ")).toMatch(/not published/);
  });
});
