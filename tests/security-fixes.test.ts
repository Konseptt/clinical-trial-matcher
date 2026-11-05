import { describe, expect, it, vi, beforeEach } from "vitest";

const aiExtract = vi.fn();
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/ai-quota", () => ({ consumeAiQuota: vi.fn(async () => true) }));
vi.mock("@/lib/extract-ai", () => ({ extractPatientProfilePatientMode: (...a: unknown[]) => aiExtract(...a) }));
vi.mock("@/lib/registries", async (orig) => ({
  ...(await orig<typeof import("@/lib/registries")>()),
  queryAllRegistries: vi.fn(async () => ({ trials: [], registryResults: [], queryPlans: [] })),
}));

import { auth } from "@/auth";
import { getResultsAction, integrateWhoTrialsAction } from "@/app/actions/match";
import { geocodeLocation } from "@/lib/location";

beforeEach(() => aiExtract.mockReset());

describe("audit fix: paid LLM gated behind auth + quota", () => {
  it("anonymous patient-mode search never calls the LLM", async () => {
    const r = await getResultsAction("I have breast cancer, 52 years old", "patient");
    expect(r.success).toBe(true);
    expect(aiExtract).not.toHaveBeenCalled();
  });
  it("signed-in patient-mode search uses the LLM", async () => {
    vi.mocked(auth).mockResolvedValueOnce({ user: { id: "u1" } } as never);
    aiExtract.mockResolvedValueOnce({ age: 52, sex: "female", primaryDiagnosis: "breast cancer", stage: null,
      biomarkers: [], priorTreatments: [], location: null, hasMetastaticDisease: null, interests: [] });
    await getResultsAction("I have breast cancer", "patient");
    expect(aiExtract).toHaveBeenCalledTimes(1);
  });
});

describe("audit fix: integrateWhoTrialsAction validates client input", () => {
  const existing = { profile: {}, trials: [], queryTerms: [], registrySummaries: [], mode: "doctor" } as never;
  it("rejects an invalid profile without doing work", async () => {
    const out = await integrateWhoTrialsAction([], { location: { city: "x".repeat(10_000) } } as never, existing);
    expect(out).toBe(existing);
  });
});

describe("audit fix: bounded geocoding", () => {
  it("does not fall back to a country centroid for an unknown city", async () => {
    expect(await geocodeLocation("Nowhereville", "", "United States", { allowNetwork: false })).toBeNull();
  });
  it("caps the network cache", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    for (let i = 0; i < 600; i++) await geocodeLocation(`zz-${i}`, null, null);
    const before = fetchMock.mock.calls.length;
    await geocodeLocation("zz-0", null, null); // evicted → refetched
    expect(fetchMock.mock.calls.length).toBe(before + 1);
    await geocodeLocation("zz-599", null, null); // still cached
    expect(fetchMock.mock.calls.length).toBe(before + 1);
    vi.unstubAllGlobals();
  });
});
