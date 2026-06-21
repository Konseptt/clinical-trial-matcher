import { describe, it, expect } from "vitest";
import {
  parsePhaseRank,
  isPhaseTwoOrAbove,
  isOpenRecruitmentStatus,
  normalizeStatus,
  matchesLocation,
  applyTrialFilters,
} from "@/lib/registries/filters";
import type { RegistryTrial } from "@/lib/registries/types";

function trial(over: Partial<RegistryTrial> = {}): RegistryTrial {
  return {
    registry: "ClinicalTrials.gov",
    trialId: "NCT1",
    title: "T",
    phase: "Phase 2",
    summary: "S",
    status: "Recruiting",
    locations: [],
    eligibilityText: "",
    url: "https://x",
    ...over,
  };
}

describe("parsePhaseRank", () => {
  it("handles arabic numerals (CT.gov normalized form)", () => {
    expect(parsePhaseRank("Phase 2")).toBe(2);
    expect(parsePhaseRank("Phase 3")).toBe(3);
    expect(parsePhaseRank("Phase 4")).toBe(4);
    expect(parsePhaseRank("Phase 1")).toBe(1);
    expect(parsePhaseRank("Phase 0")).toBe(0);
  });
  it("handles roman numerals", () => {
    expect(parsePhaseRank("Phase II")).toBe(2);
    expect(parsePhaseRank("Phase III")).toBe(3);
    expect(parsePhaseRank("Phase IV")).toBe(4);
    expect(parsePhaseRank("Phase I")).toBe(1);
  });
  it("takes the max of combined phases", () => {
    expect(parsePhaseRank("Phase I/II")).toBe(2);
    expect(parsePhaseRank("Phase II/III")).toBe(3);
    expect(parsePhaseRank("Phase 1/2")).toBe(2);
  });
  it("handles roman sub-phase suffixes (IIa/IIb/IIIa)", () => {
    expect(parsePhaseRank("Phase IIb")).toBe(2);
    expect(parsePhaseRank("Phase IIa")).toBe(2);
    expect(parsePhaseRank("Phase IIIa")).toBe(3);
    expect(isPhaseTwoOrAbove("Phase IIb")).toBe(true);
  });
  it("returns 0 for unknown", () => {
    expect(parsePhaseRank("Not specified")).toBe(0);
    expect(parsePhaseRank("")).toBe(0);
  });
});

describe("isPhaseTwoOrAbove", () => {
  it("true for II+", () => {
    expect(isPhaseTwoOrAbove("Phase 2")).toBe(true);
    expect(isPhaseTwoOrAbove("Phase III")).toBe(true);
  });
  it("false for I and unknown", () => {
    expect(isPhaseTwoOrAbove("Phase 1")).toBe(false);
    expect(isPhaseTwoOrAbove("Not specified")).toBe(false);
  });
});

describe("isOpenRecruitmentStatus", () => {
  it("accepts recruiting variants", () => {
    expect(isOpenRecruitmentStatus("Recruiting")).toBe(true);
    expect(isOpenRecruitmentStatus("NOT_YET_RECRUITING")).toBe(true);
    expect(isOpenRecruitmentStatus("Enrolling by invitation")).toBe(true);
    expect(isOpenRecruitmentStatus("Authorised")).toBe(true);
  });
  it("rejects closed variants", () => {
    expect(isOpenRecruitmentStatus("Completed")).toBe(false);
    expect(isOpenRecruitmentStatus("Terminated")).toBe(false);
    expect(isOpenRecruitmentStatus("No longer recruiting")).toBe(false);
  });
});

describe("normalizeStatus", () => {
  it("uppercases and replaces underscores", () => {
    expect(normalizeStatus("not_yet_recruiting")).toBe("NOT YET RECRUITING");
  });
});

describe("matchesLocation", () => {
  it("returns true when no location filter", () => {
    expect(matchesLocation(trial(), null)).toBe(true);
  });
  it("matches on state token", () => {
    const t = trial({ locations: [{ facility: "F", city: "Boston", state: "MA", country: "United States" }] });
    expect(matchesLocation(t, { city: null, state: "MA", country: null })).toBe(true);
  });
  it("matches US country via state code resolution", () => {
    const t = trial({ locations: [{ facility: "F", city: "Boston", state: "MA", country: "United States" }] });
    expect(matchesLocation(t, { city: "Boston", state: "MA", country: null })).toBe(true);
  });
  it("returns true for trials with no listed sites", () => {
    expect(matchesLocation(trial({ locations: [] }), { city: "Paris", state: null, country: "France" })).toBe(true);
  });
});

describe("applyTrialFilters", () => {
  it("drops non-recruiting and prioritizes phase II+", () => {
    const trials = [
      trial({ trialId: "a", status: "Recruiting", phase: "Phase 3" }),
      trial({ trialId: "b", status: "Completed", phase: "Phase 3" }),
      trial({ trialId: "c", status: "Recruiting", phase: "Phase 1" }),
    ];
    const out = applyTrialFilters(trials, { location: null, prioritizePhaseTwoPlus: true });
    expect(out.map((t) => t.trialId)).toEqual(["a"]);
  });
  it("keeps phase I trials when no phase II+ available", () => {
    const trials = [trial({ trialId: "c", status: "Recruiting", phase: "Phase 1" })];
    const out = applyTrialFilters(trials, { location: null, prioritizePhaseTwoPlus: true });
    expect(out.map((t) => t.trialId)).toEqual(["c"]);
  });
});
