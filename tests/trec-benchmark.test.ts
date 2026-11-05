// Opt-in accuracy benchmark on TREC Clinical Trials 2021 expert judgments.
//   python3 scripts/build-trec-fixture.py topics2021.xml qrels2021.txt trec.json
//   TREC_FIXTURE=trec.json npx vitest run tests/trec-benchmark.test.ts
// Metrics: NDCG@10 (gain = judgment 0/1/2), P@10 eligible, and AUC of
// eligible-vs-excluded (does scoring push excluded trials below eligible ones?).
// Ablation: drop one score component at a time, re-rank, report delta.
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import { extractPatientProfile } from "@/lib/extract";
import { mapStudy } from "@/lib/registries/clinicaltrials-gov";
import { scoreAllRegistryTrials } from "@/lib/scoring";
import type { ClinicalTrialsGovStudy, MatchedTrial } from "@/lib/types";

type Fixture = { topics: { id: string; text: string; judgments: Record<string, number> }[]; studies: Record<string, ClinicalTrialsGovStudy> };

function ndcg10(ranked: string[], rel: Record<string, number>): number {
  const dcg = (gs: number[]) => gs.slice(0, 10).reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0);
  const ideal = dcg(Object.values(rel).sort((a, b) => b - a));
  return ideal ? dcg(ranked.map((id) => rel[id] ?? 0)) / ideal : 0;
}
function auc(scores: Record<string, number>, rel: Record<string, number>): number | null {
  const pos = Object.keys(rel).filter((k) => rel[k] === 2).map((k) => scores[k]);
  const neg = Object.keys(rel).filter((k) => rel[k] === 1).map((k) => scores[k]);
  if (!pos.length || !neg.length) return null;
  let w = 0;
  for (const p of pos) for (const n of neg) w += p > n ? 1 : p === n ? 0.5 : 0;
  return w / (pos.length * neg.length);
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe.skipIf(!process.env.TREC_FIXTURE)("TREC CT 2021 benchmark", () => {
  it("reports accuracy and ablation", async () => {
    const fx: Fixture = JSON.parse(readFileSync(process.env.TREC_FIXTURE!, "utf8"));
    const perTopic: { rel: Record<string, number>; trials: MatchedTrial[] }[] = [];
    for (const t of fx.topics) {
      const profile = { ...extractPatientProfile(t.text), location: null };
      const trials = await scoreAllRegistryTrials(Object.keys(t.judgments).map((id) => mapStudy(fx.studies[id])), profile, t.text);
      perTopic.push({ rel: t.judgments, trials });
    }
    const evaluate = (scoreOf: (m: MatchedTrial) => number) => {
      const n: number[] = [], p: number[] = [], a: number[] = [];
      for (const { rel, trials } of perTopic) {
        const s = Object.fromEntries(trials.map((m) => [m.trialId, scoreOf(m)]));
        const ranked = [...trials].sort((x, y) => s[y.trialId] - s[x.trialId] || x.trialId.localeCompare(y.trialId)).map((m) => m.trialId);
        n.push(ndcg10(ranked, rel));
        p.push(ranked.slice(0, 10).filter((id) => rel[id] === 2).length / 10);
        const v = auc(s, rel); if (v !== null) a.push(v);
      }
      return { ndcg10: +mean(n).toFixed(4), p10: +mean(p).toFixed(4), auc: +mean(a).toFixed(4) };
    };
    const full = evaluate((m) => m.matchScore);
    const PENALTIES = new Set(["biomarkerPenalties", "stagePenalties", "washoutPenalties", "exclusionOverlap"]);
    const keys = Object.keys(perTopic[0].trials[0].scoreBreakdown).filter((k) => k !== "baseline");
    const ablation: Record<string, { ndcg10: number; p10: number; auc: number }> = {};
    for (const k of keys) {
      const r = evaluate((m) => {
        const v = (m.scoreBreakdown as unknown as Record<string, number>)[k] ?? 0;
        return m.matchScore + (PENALTIES.has(k) ? v : -v); // remove this component's contribution
      });
      ablation[k] = { ndcg10: +(r.ndcg10 - full.ndcg10).toFixed(4), p10: +(r.p10 - full.p10).toFixed(4), auc: +(r.auc - full.auc).toFixed(4) };
    }
    if (process.env.TREC_DUMP) {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.TREC_DUMP, JSON.stringify(perTopic.map(({ rel, trials }, i) => ({
        id: fx.topics[i].id, rel, scores: Object.fromEntries(trials.map((m) => [m.trialId, m.matchScore])),
      }))));
    }
    console.log(JSON.stringify({ topics: perTopic.length, full, ablationDelta: ablation }, null, 1));
  }, 300_000);
});
