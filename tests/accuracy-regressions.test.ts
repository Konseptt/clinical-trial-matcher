import { describe, expect, it } from "vitest";
import { extractPatientProfile } from "@/lib/extract";
import { normalizeCondition } from "@/lib/normalization";

describe("profile extraction accuracy", () => {
  it("does not read 'managed'/'many' as male", () => {
    expect(extractPatientProfile("54-year-old woman, symptoms managed with many drugs. Breast cancer.").sex).toBe("female");
  });
  it("reads 45M / 62F shorthand", () => {
    expect(extractPatientProfile("45M with NSCLC").sex).toBe("male");
    expect(extractPatientProfile("62F with breast cancer").sex).toBe("female");
  });
  it("takes patient age, not disease duration", () => {
    expect(extractPatientProfile("Diagnosed with MS 3 years ago. 45-year-old female.").age).toBe(45);
    expect(extractPatientProfile("Patient aged 61, 10-year history of RA").age).toBe(61);
  });
  it("captures the stage value, not the lead-in phrase", () => {
    expect(extractPatientProfile("NSCLC classified as IIIB").stage?.toUpperCase()).toBe("IIIB");
  });
  it("keeps driver-mutation polarity", () => {
    const p = extractPatientProfile("NSCLC, EGFR exon 19 deletion, ALK negative, KRAS wild-type.");
    expect(p.biomarkers).toContain("EGFR");
    expect(p.biomarkers).toContain("ALK negative");
    expect(p.biomarkers).toContain("KRAS negative");
    expect(p.biomarkers).not.toContain("ALK");
  });
  it("'no ALK rearrangement' is negative", () => {
    expect(extractPatientProfile("Lung adenocarcinoma, no ALK rearrangement.").biomarkers).toContain("ALK negative");
  });
});

describe("condition normalization accuracy", () => {
  it("honorific Ms. is not multiple sclerosis", () => {
    expect(normalizeCondition("Ms. Jones, 52, breast cancer").canonicalName).not.toBe("Multiple Sclerosis");
  });
  it("relative's diagnosis does not win", () => {
    expect(normalizeCondition("Mother had MS. Patient has breast cancer.").canonicalName).not.toBe("Multiple Sclerosis");
  });
  it("still detects patient MS", () => {
    expect(normalizeCondition("Diagnosed with MS in 2019").canonicalName).toBe("Multiple Sclerosis");
  });
});
