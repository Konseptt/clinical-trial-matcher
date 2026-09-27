import { describe, expect, it } from "vitest";
import { excerptCriteria } from "@/lib/criteria-excerpt";
import { indexNowBody } from "@/lib/indexnow";
import {
  findKnownCondition,
  listKnownConditions,
  registryConditionQuery,
} from "@/lib/normalization";

describe("public condition catalog", () => {
  it("slugs an apostrophe and stays unique", () => {
    const conditions = listKnownConditions();
    const slugs = conditions.map((condition) => condition.slug);
    expect(slugs).toContain("crohns-disease");
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(findKnownCondition("breast-cancer")?.canonicalName).toBe("Breast Cancer");
  });

  it("keeps short abbreviations out of the registry query", () => {
    const ms = findKnownCondition("multiple-sclerosis");
    expect(ms).toBeDefined();
    const query = registryConditionQuery(ms!);
    expect(query).toContain("Multiple Sclerosis");
    expect(query.split(" OR ")).not.toContain("MS");
  });
});

describe("excerptCriteria", () => {
  it("splits inclusion and exclusion lines", () => {
    const excerpt = excerptCriteria(
      "Inclusion Criteria:\n- Diagnosis of breast cancer confirmed by biopsy\nExclusion Criteria:\n- Prior trastuzumab within 90 days"
    );
    expect(excerpt.unlabeled).toBe(false);
    expect(excerpt.inclusion[0]).toMatch(/breast cancer/i);
    expect(excerpt.exclusion[0]).toMatch(/trastuzumab/i);
  });
});

describe("indexNowBody", () => {
  it("points the key file at the public host", () => {
    const body = indexNowBody("abc12345", ["https://clinicaltrial.ranjansharma.info.np/conditions"]);
    expect(body.host).toBe("clinicaltrial.ranjansharma.info.np");
    expect(body.keyLocation).toBe(
      "https://clinicaltrial.ranjansharma.info.np/abc12345.txt"
    );
    expect(body.urlList).toHaveLength(1);
  });
});
