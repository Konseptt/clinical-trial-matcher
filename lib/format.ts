export const TRIAL_SUMMARY_DISPLAY_MAX = 320;
export const TRIAL_SUMMARY_STORAGE_MAX = 1200;

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/** Replace em/en dashes with plain punctuation for patient-facing copy. */
export function stripEmDashes(text: string): string {
  return text
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, "-")
    .replace(/\s+,/g, ",")
    .replace(/,{2,}/g, ",")
    .trim();
}

export function normalizeTrialSummary(text: string): string {
  return stripEmDashes(decodeHtmlEntities(text).replace(/\s+/g, " ").trim());
}

export function capTrialSummary(
  text: string,
  maxLength = TRIAL_SUMMARY_STORAGE_MAX
): string {
  const cleaned = normalizeTrialSummary(text);
  if (cleaned.length <= maxLength) return cleaned;
  return truncateTrialSummary(cleaned, maxLength);
}

export function truncateTrialSummary(
  text: string,
  maxLength = TRIAL_SUMMARY_DISPLAY_MAX
): string {
  const cleaned = normalizeTrialSummary(text);
  if (cleaned.length <= maxLength) return cleaned;

  const truncated = cleaned.slice(0, maxLength);
  const lastSentence = truncated.lastIndexOf(". ");
  const cutPoint =
    lastSentence > maxLength * 0.45 ? lastSentence + 1 : truncated.lastIndexOf(" ");

  const sliceEnd = cutPoint > 0 ? cutPoint : maxLength;
  return `${truncated.slice(0, sliceEnd).trim()}...`;
}

export function formatTrialStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
