import { describe, expect, it } from "vitest";
import { mapCtisSearchHit, parseLegacyHtml } from "@/lib/registries/eu-ctr";
import { parseLegacyXml } from "@/lib/registries/isrctn";
import { parseWhoGridResults } from "@/lib/registries/who-ictrp-shared";
import { selectDisplayedTrials } from "@/lib/scoring";
import type { MatchedTrial } from "@/lib/types";

const EU_ROW = `
<table class="result">
  <tr>
    <td><span class="label">EudraCT Number:</span> 2017-002850-35</td>
  </tr>
  <tr>
    <td><span class="label">Full Title:</span> Phase II breast cancer follow-up</td>
  </tr>
  <tr>
    <td><span class="label">Medical condition:</span> Invasive breast cancer</td>
  </tr>
  <tr>
    <td><a href="/ctr-search/trial/2017-002850-35/ES">ES</a> <span class="status">(Ongoing)</span></td>
  </tr>
</table>
`;

const WHO_ROW = `
<table id="GridView1">
<tr valign="top">
  <td>Recruiting</td>
  <td></td>
  <td><span id="GridView1_ctl03_Label1">ChiCTR2600132990</span></td>
  <td></td>
  <td><a href="Trial2.aspx?TrialID=ChiCTR2600132990">Breast cancer immune study</a></td>
</tr>
<tr valign="top">
  <td>Not Recruiting</td>
  <td></td>
  <td><span>CLOSED1</span></td>
  <td></td>
  <td><a href="Trial2.aspx?TrialID=CLOSED1">Closed study</a></td>
</tr>
</table>
`;

const ISRCTN_XML = `
<allTrials>
  <fullTrial>
    <trial>
      <isrctn>14792862</isrctn>
      <trialDescription><title>Breast cancer MRI screening</title></trialDescription>
      <phase/>
      <recruitmentStart>2026-06-22T00:00:00.000Z</recruitmentStart>
      <recruitmentEnd>2027-06-30T00:00:00.000Z</recruitmentEnd>
      <recruitmentCountries><country>United Kingdom</country></recruitmentCountries>
    </trial>
  </fullTrial>
</allTrials>
`;

function matched(registry: MatchedTrial["registry"], trialId: string, score: number): MatchedTrial {
  return {
    registry,
    trialId,
    title: trialId,
    matchScore: score,
    scoreBreakdown: {
      baseline: 40,
      diagnosisMatch: 0,
      biomarkerMatch: 0,
      interestsMatch: 0,
      priorTreatmentsMatch: 0,
      stageMatch: 0,
      phaseBonus: 0,
      locationMatch: 0,
      sexMatch: 0,
      biomarkerPenalties: 0,
      stagePenalties: 0,
    },
    phase: "Phase 2",
    summary: "",
    locations: [],
    status: "Recruiting",
    url: "https://example.test",
    distance: null,
  };
}

describe("EU sources", () => {
  it("reads an ongoing EudraCT row", () => {
    const trials = parseLegacyHtml(EU_ROW);
    expect(trials).toHaveLength(1);
    expect(trials[0]?.trialId).toBe("2017-002850-35");
    expect(trials[0]?.status).toMatch(/ongoing/i);
  });

  it("keeps recruiting CTIS codes and drops ended ones", () => {
    const open = mapCtisSearchHit({
      ctNumber: "2024-000001-11-00",
      ctTitle: "A breast cancer study",
      trialPhase: "Therapeutic confirmatory  (Phase III)",
      ctStatus: 4,
      trialCountries: ["France:4", "Germany:3"],
      conditions: "Breast cancer",
    });
    expect(open?.status).toBe("Recruiting");
    expect(open?.locations.map((location) => location.country)).toEqual(["France", "Germany"]);

    expect(mapCtisSearchHit({ ctNumber: "2024-9", ctStatus: 8, ctTitle: "Ended" })).toBeNull();
  });
});

describe("WHO grid", () => {
  it("keeps recruiting rows and drops not recruiting", () => {
    const trials = parseWhoGridResults(WHO_ROW);
    expect(trials.map((trial) => trial.trialId)).toEqual(["ChiCTR2600132990"]);
    expect(trials[0]?.url).toContain("TrialID=ChiCTR2600132990");
  });
});

describe("ISRCTN xml", () => {
  it("reads id, title, and an open recruitment window", () => {
    const trials = parseLegacyXml(ISRCTN_XML);
    expect(trials).toHaveLength(1);
    expect(trials[0]?.trialId).toBe("14792862");
    expect(trials[0]?.title).toMatch(/MRI/);
    expect(trials[0]?.status).toBe("Recruiting");
  });
});

describe("selectDisplayedTrials", () => {
  it("keeps a lower-scored trial from a registry that would otherwise fall off the list", () => {
    const ranked = [
      ...Array.from({ length: 10 }, (_, index) =>
        matched("ClinicalTrials.gov", `NCT${index}`, 90 - index)
      ),
      matched("EU-CTR", "EU1", 20),
      matched("WHO ICTRP", "WHO1", 20),
      matched("ISRCTN", "IS1", 20),
    ];

    const shown = selectDisplayedTrials(ranked);
    const registries = new Set(shown.map((trial) => trial.registry));
    expect(registries.has("EU-CTR")).toBe(true);
    expect(registries.has("WHO ICTRP")).toBe(true);
    expect(registries.has("ISRCTN")).toBe(true);
  });
});
