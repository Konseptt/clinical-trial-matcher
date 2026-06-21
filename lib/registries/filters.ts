import { resolveRegistryCountry } from "@/lib/location";
import type { RegistryTrial } from "./types";

const RECRUITING_STATUSES = new Set([
  "RECRUITING",
  "NOT YET RECRUITING",
  "NOT_YET_RECRUITING",
  "ENROLLING BY INVITATION",
  "ENROLLING_BY_INVITATION",
  "ACTIVE NOT RECRUITING",
  "ACTIVE_NOT_RECRUITING",
  "ONGOING",
  "AUTHORISED",
  "AUTHORIZED",
  "OPEN",
]);

const EXCLUDED_STATUSES = new Set([
  "COMPLETED",
  "TERMINATED",
  "WITHDRAWN",
  "SUSPENDED",
  "CLOSED",
  "STOPPED",
  "PREMATURELY ENDED",
  "NO LONGER RECRUITING",
]);

export function normalizeStatus(status: string): string {
  return status.trim().toUpperCase().replace(/_/g, " ");
}

export function isOpenRecruitmentStatus(status: string): boolean {
  const normalized = normalizeStatus(status);
  if (EXCLUDED_STATUSES.has(normalized)) return false;
  if (RECRUITING_STATUSES.has(normalized)) return true;

  return (
    normalized.includes("RECRUIT") ||
    normalized.includes("NOT YET RECRUIT") ||
    normalized.includes("ONGOING") ||
    normalized.includes("AUTHORIS") ||
    normalized.includes("AUTHORIZ")
  );
}

export function parsePhaseRank(phase: string): number {
  // Phase strings arrive in both roman ("Phase II") and arabic ("Phase 2")
  // form depending on the registry. Normalize roman numerals to digits, then
  // take the highest phase number mentioned (handles combos like "1/2", "2/3").
  // Allow an A/B/C sub-phase suffix ("IIb", "IIIa"): the bare \bII\b boundary
  // failed on the trailing letter, so "Phase IIb" scored 0 and eligible
  // phase-2 trials got dropped by the phase-two-plus filter.
  const normalized = phase
    .toUpperCase()
    .replace(/\bIV[ABC]?\b/g, "4")
    .replace(/\bIII[ABC]?\b/g, "3")
    .replace(/\bII[ABC]?\b/g, "2")
    .replace(/\bI[ABC]?\b/g, "1");

  const nums = normalized.match(/(?<![0-9])[0-4](?![0-9])/g);
  if (nums && nums.length > 0) {
    return Math.max(...nums.map((n) => parseInt(n, 10)));
  }

  return 0;
}

export function isPhaseTwoOrAbove(phase: string): boolean {
  return parsePhaseRank(phase) >= 2;
}

export function matchesLocation(
  trial: RegistryTrial,
  location: {
    city: string | null;
    state: string | null;
    country: string | null;
  } | null
): boolean {
  if (!location || (!location.city && !location.state && !location.country)) {
    return true;
  }

  const locText = trial.locations
    .map((l) => `${l.city} ${l.state} ${l.country}`.toLowerCase())
    .join(" ");

  const registryCountry = resolveRegistryCountry(location);
  if (registryCountry && locText.includes(registryCountry.toLowerCase())) {
    return true;
  }
  if (location.state && locText.includes(location.state.toLowerCase())) {
    return true;
  }
  if (location.city && locText.includes(location.city.toLowerCase())) {
    return true;
  }

  return trial.locations.length === 0;
}

export function applyTrialFilters(
  trials: RegistryTrial[],
  options: {
    location: {
      city: string | null;
      state: string | null;
      country: string | null;
    } | null;
    prioritizePhaseTwoPlus: boolean;
  }
): RegistryTrial[] {
  let filtered = trials.filter((trial) =>
    isOpenRecruitmentStatus(trial.status)
  );

  if (options.prioritizePhaseTwoPlus) {
    const phaseFiltered = filtered.filter((trial) =>
      isPhaseTwoOrAbove(trial.phase)
    );
    if (phaseFiltered.length > 0) {
      filtered = phaseFiltered;
    }
  }

  return filtered;
}
