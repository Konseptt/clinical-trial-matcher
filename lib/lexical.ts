import IDF from "./trial-idf.json";

/**
 * BM25 lexical relevance between the patient's own words and a trial.
 *
 * Tuned on TREC Clinical Trials 2021 expert judgments (odd topics tuned, even
 * topics held out): title relevance plus an exclusion-overlap penalty lifted
 * held-out NDCG@10 0.51 → 0.61 and eligible-vs-excluded AUC 0.49 → 0.60.
 * IDF comes from 10k ClinicalTrials.gov records disjoint from the benchmark
 * pool (scripts/build-idf.py), so it is generic, not benchmark-fitted.
 */
const STOP = new Set(
  "a an the and or of to in for with on at by is are was were be been has have had no not patient patients history year years old who that this from as per any all other than prior within his her he she s p".split(" ")
);
const df = IDF.df as Record<string, number>;
const N = IDF.n;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? []).filter((w) => !STOP.has(w));
}

function idf(w: string): number {
  const d = df[w] ?? 1;
  return Math.log(1 + (N - d + 0.5) / (d + 0.5));
}

export function bm25(query: Set<string>, doc: string[], avgLen: number, k = 1.2, b = 0.75): number {
  if (doc.length === 0) return 0;
  const tf = new Map<string, number>();
  for (const w of doc) tf.set(w, (tf.get(w) ?? 0) + 1);
  const norm = k * (1 - b + (b * doc.length) / avgLen);
  let s = 0;
  for (const w of query) {
    const f = tf.get(w);
    if (f) s += (idf(w) * f * (k + 1)) / (f + norm);
  }
  return s;
}

export const TITLE_WEIGHT = 3;
export const TITLE_CAP = 40;
export const EXCLUSION_WEIGHT = 1;
export const EXCLUSION_CAP = 30;

/** Points for title match and penalty for patient terms named in exclusion criteria. */
export function lexicalScores(
  query: Set<string>,
  title: string,
  exclusionText: string
): { textRelevance: number; exclusionOverlap: number } {
  return {
    textRelevance: Math.min(TITLE_CAP, TITLE_WEIGHT * bm25(query, tokenize(title), 25)),
    exclusionOverlap: Math.min(EXCLUSION_CAP, EXCLUSION_WEIGHT * bm25(query, tokenize(exclusionText), 300)),
  };
}
