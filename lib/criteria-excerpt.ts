export interface CriteriaExcerpt {
  inclusion: string[];
  exclusion: string[];
  unlabeled: boolean;
}

function linesFrom(block: string, limit: number): string[] {
  return block
    .split("\n")
    .map((line) => line.replace(/^[\s>*•\-–\d.)]+/, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 12)
    .filter((line) => !/^(inclusion|exclusion)\s+criteria:?$/i.test(line))
    .slice(0, limit);
}

export function excerptCriteria(text: string, limit = 6): CriteriaExcerpt {
  const source = text.replace(/\r\n/g, "\n").trim();
  if (!source) return { inclusion: [], exclusion: [], unlabeled: false };

  const inclusionAt = source.search(/\binclusion criteria\b/i);
  const exclusionAt = source.search(/\bexclusion criteria\b/i);

  if (inclusionAt === -1 && exclusionAt === -1) {
    return { inclusion: linesFrom(source, limit), exclusion: [], unlabeled: true };
  }

  let inclusionBlock = "";
  let exclusionBlock = "";

  if (inclusionAt !== -1 && exclusionAt !== -1 && exclusionAt > inclusionAt) {
    inclusionBlock = source.slice(inclusionAt, exclusionAt);
    exclusionBlock = source.slice(exclusionAt);
  } else if (exclusionAt !== -1 && inclusionAt !== -1 && inclusionAt > exclusionAt) {
    exclusionBlock = source.slice(exclusionAt, inclusionAt);
    inclusionBlock = source.slice(inclusionAt);
  } else if (inclusionAt !== -1) {
    inclusionBlock = source.slice(inclusionAt);
  } else {
    exclusionBlock = source.slice(exclusionAt);
  }

  return {
    inclusion: linesFrom(inclusionBlock, limit),
    exclusion: linesFrom(exclusionBlock, limit),
    unlabeled: false,
  };
}
