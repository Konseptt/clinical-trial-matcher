// Opt-in live smoke against real registries: LIVE=1 npx vitest run tests/live-registries.test.ts
import { describe, expect, it } from "vitest";
import { queryAllRegistries } from "@/lib/registries";
import { extractPatientProfile } from "@/lib/extract";

describe.skipIf(!process.env.LIVE)("live registries", () => {
  it("every source answers within the timeout and returns parseable trials", async () => {
    const profile = extractPatientProfile(
      "52-year-old woman with metastatic breast cancer, ER positive, HER2 negative. Lives in Boston, MA, USA."
    );
    const t0 = Date.now();
    const { registryResults } = await queryAllRegistries(profile);
    const ms = Date.now() - t0;
    for (const r of registryResults) {
      console.log(`${r.registry}: ${r.trials.length} trials${r.error ? ` (error: ${r.error})` : ""}`);
      for (const t of r.trials) {
        expect(t.trialId).toBeTruthy();
        expect(t.title).toBeTruthy();
        expect(t.url).toMatch(/^https:\/\//);
      }
    }
    console.log(`total ${ms}ms`);
    expect(ms).toBeLessThan(20_000);
    const byName = Object.fromEntries(registryResults.map((r) => [r.registry, r]));
    expect(byName["ClinicalTrials.gov"].trials.length).toBeGreaterThan(0);
    expect(byName["ISRCTN"].trials.length).toBeGreaterThan(0);
    expect(byName["EU-CTR"].trials.length).toBeGreaterThan(0);
    // WHO blocks server-side bots: must fail fast with the browser-fallback signal, never hang or silently return 0.
    const who = byName["WHO ICTRP"];
    expect(who.trials.length > 0 || who.error === "WHO_ICTRP_BROWSER_REQUIRED").toBe(true);
  }, 30_000);
});
